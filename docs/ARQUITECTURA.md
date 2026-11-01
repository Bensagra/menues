# CartaLista · Arquitectura

Este documento explica cómo está construido CartaLista, por qué, y qué garantías da cada parte. Para instalar y operar, ver el [README](../README.md).

## Visión general

```
Navegador ──► Next.js 16 (App Router, Cache Components, proxy.ts)
                │  Server Components leen con la sesión del usuario (RLS)
                │  Server Actions escriben llamando RPC de Postgres
                │  /m/<sucursal>: carta pública cacheada (use cache + cacheTag)
                ▼
            Supabase: Postgres (RLS + funciones), Auth, Storage
                ▲
Worker Node ────┘  toma importaciones de la cola (tabla imports) y llama a la IA (Gemini o Grok)
```

| Pieza | Tecnología |
|---|---|
| Web | Next.js 16.4 (App Router, Cache Components, Partial Prerendering), React 19, TypeScript, Tailwind 4, shadcn/ui (Radix) |
| Datos | Supabase: Postgres 17, Auth (email y contraseña con confirmación), Storage |
| Validación | Zod en cliente y servidor; checks y funciones en Postgres como autoridad final |
| IA | Adaptadores propios de la Responses API de xAI (Grok) y de `generateContent` de Gemini, detrás de una interfaz `MenuExtractionProvider`; se elige con `AI_PROVIDER` |
| Pruebas | Vitest (unitarias e integración contra Supabase local) y Playwright (e2e contra build de producción) |

## Multitenancy

- **Negocio** (cuenta comercial) → **sucursales** (cada una con su carta pública, QR y zona horaria) → **membresías** (persona + negocio + rol + sucursales autorizadas).
- Invariante: ninguna fila referencia entidades de otro negocio. Se garantiza con **claves foráneas compuestas** `(business_id, id)` en todas las relaciones internas (productos ↔ menús, overrides ↔ sucursales, importaciones ↔ menús, etc.), no solo con código.
- Roles: `owner`, `admin`, `editor` (con sucursales asignadas y permiso de publicar opcional) y **administrador de plataforma** (fuera de los negocios).

### Matriz de permisos

| Permiso | Propietario | Administrador | Editor | Editor con publicación |
|---|:-:|:-:|:-:|:-:|
| Ver negocio, editar borrador, importar fotos, ver historial y estadísticas | ✓ | ✓ | ✓ | ✓ |
| Publicar, restaurar versiones, programar promociones | ✓ | ✓ | – | ✓ |
| Datos del local, sucursales, equipo, plan, auditoría, gestionar cartas | ✓ | ✓ | – | – |

- La matriz vive en `app.role_permits()` (Postgres) y se replica en `src/domain/permissions.ts` para la UI. Una prueba de integración verifica que ambas coincidan.
- Nadie puede modificar su propia membresía ni otorgar un rol superior al suyo (owner → todos; admin → editor).
- El alcance por sucursal se aplica también al contenido compartido: editar la base de una carta que se usa en varias sucursales exige acceso a todas ellas; con acceso parcial solo se editan precios y disponibilidad propios de las sucursales permitidas.

## Modelo de seguridad

1. **Lecturas**: los Server Components usan el JWT del usuario; Postgres aplica RLS en cada tabla (`SELECT` únicamente para `authenticated`, nada para `anon`).
2. **Escrituras**: no hay `INSERT/UPDATE/DELETE` directos. Todo pasa por funciones `SECURITY DEFINER` con `search_path` vacío que verifican identidad (`auth.uid()`), permiso, alcance de sucursal, estado de la cuenta y concurrencia, y escriben la auditoría en la misma transacción.
3. **Privilegios de funciones**: se revoca `EXECUTE` de `public`, `anon` y `authenticated` en todas las funciones y se concede explícitamente. Además, los privilegios por defecto globales están cerrados: una función creada en una migración futura nace sin acceso público (hay una prueba de regresión). `anon` solo ejecuta `get_public_menu` y `get_invitation`.
4. **Clave secreta**: solo en el servidor, el worker y los scripts. Se usa para operaciones de sistema después de verificar la sesión (URLs firmadas de Storage, conteo de visitas, panel de plataforma) y nunca llega al navegador.
5. **IDs y roles del cliente no se confían**: las acciones vuelven a validar con Zod y la base vuelve a resolver la membresía del usuario de la sesión.
6. **Storage**: los originales de importación y las subidas son privados; las subidas usan URLs firmadas emitidas después de autorizar; el servidor valida el contenido real del archivo (formato, dimensiones, tamaño) con `sharp`. Las imágenes públicas se reprocesan a WebP sin metadatos y con rutas no adivinables.
7. **Plataforma**: el rol solo se otorga con `npm run admin:grant` (clave secreta). No hay suplantación de usuarios: la plataforma actúa con su identidad, todo queda auditado y el panel muestra un banner fijo.
8. **Invitaciones**: token aleatorio del que solo se guarda el hash, atado al email invitado, con vencimiento y de un solo uso.

## Catálogo, borrador y versiones

- El **catálogo** (menús, categorías, productos, variantes, extras, precios y disponibilidad por sucursal) es siempre el **borrador**: editarlo no cambia lo que ven los clientes.
- **Publicar** genera, por cada sucursal elegida, una **versión inmutable** (`menu_versions.snapshot`, JSON con hash de contenido) y apunta `menu_branches.published_version_id` a ella. Todo ocurre en una transacción: la carta pública cambia de una versión completa a otra.
- Publicar es **idempotente** (clave de idempotencia por intento) y no crea versiones si el contenido no cambió.
- **Concurrencia**: productos y categorías tienen `revision`; guardar con una revisión vieja devuelve `revision_conflict` y la UI ofrece ver la versión actual.
- **Historial**: cada publicación registra quién publicó, desde dónde (manual, importación, restauración, precios masivos) y un resumen de cambios. **Restaurar** publica una versión anterior como publicación nueva: el historial nunca se reescribe.

## Carta pública y caché

- `/m/<sucursal>` lee únicamente `get_public_menu`, que devuelve versiones publicadas y datos públicos del local. Nunca hay borradores en endpoints públicos ni en la caché.
- La respuesta se cachea con `use cache` + `cacheTag(public-menu:<slug>)` y se invalida con `updateTag` al publicar, restaurar, suspender, cambiar datos del local o programar promociones.
- El estado "abierto/cerrado" y las promociones activas se calculan con la hora actual en la zona horaria de la sucursal: la página recibe la hora de la solicitud para el primer render y se actualiza sola cada minuto, así la caché nunca muestra estados vencidos.
- Estados contemplados: carta con y sin fotos, detalle de producto, búsqueda sin resultados, carta no publicada, enlace inexistente, cuenta no disponible, error de conexión y local cerrado (la carta se puede consultar igual).

## Importación con fotos

### Cola persistente

La tabla `imports` es la cola. Sobrevive al cierre del navegador y a reinicios:

- Estados visibles: pendiente → procesando → requiere revisión → completado; también fallido y cancelado. `uploading` es interno (fotos subiéndose).
- Etapas reales: preparando fotos, leyendo cada página, comparando con la carta, listo para revisar.
- El worker toma trabajos con `FOR UPDATE SKIP LOCKED`, **lease** con vencimiento y **token**: si muere, otro worker lo retoma; un worker con lease vencido no puede escribir.
- Reintentos acotados con backoff exponencial (30 s · 2ⁿ, máximo 15 min) para errores transitorios (429, 5xx, timeouts, salidas inválidas). Errores permanentes (credencial inválida, imagen ilegible) fallan sin reintentar.
- Máximo 2 trabajos simultáneos por negocio; las cuentas suspendidas no se procesan.
- **Cuota**: se reserva de forma atómica al enviar (bloqueo de la fila de consumo del mes, también con envíos concurrentes) y se liquida o libera al terminar. Un fallo del proveedor no consume cuota ni toca la carta publicada.
- Idempotencia del envío, detección de la misma foto en curso (`duplicate_import`) y cancelación de subidas abandonadas.
- Logs estructurados sin secretos ni contenido de imágenes.

### Extracción con IA (Grok o Gemini)

- Los dos proveedores reciben las mismas instrucciones fijas y la imagen (JPEG normalizado) como dato, con `store: false` y **sin herramientas**: el modelo no puede ejecutar nada ni escribir en la base. La salida pasa siempre por la misma validación Zod en el servidor.
- **Grok**: Responses API, imagen como `input_image`, salida con **JSON Schema estricto**.
- **Gemini**: `generateContent`, imagen como `inlineData`, salida con `responseJsonSchema`, clave en el encabezado `x-goog-api-key`. El esquema se envía sin `maxItems`, porque Gemini rechaza muchos anidados; los límites los aplica la validación del servidor. Tiene nivel gratuito con límite diario: los 429 y 503 se reintentan con la espera que indica Google.
- El texto de la imagen es **dato no confiable**: las instrucciones lo dicen explícitamente y, de todos modos, la salida solo puede ser una transcripción que pasa por las reglas de comparación y la revisión humana.
- No se inventa confianza: el modelo informa campos ilegibles y el sistema deriva señales verificables (precio ambiguo, coincidencia dudosa, moneda distinta).

### Comparación y revisión

Reglas del motor (`src/domain/diff.ts`, probado):

- Una foto parcial **nunca elimina** productos; lo que no aparece se informa, no se borra.
- Un campo ilegible **nunca se convierte en cero** ni pisa un valor existente; un campo ausente no sobrescribe.
- No se inventa moneda; una moneda distinta a la del negocio se marca para revisar.
- «Solo precios» solo cambia precios; «Categorías» respeta las categorías elegidas; nunca se tocan sucursales fuera del alcance.
- Una foto repetida no duplica productos; coincidencias inciertas se presentan como "¿es el mismo producto?".
- Los cambios aprobados se aplican al borrador en una transacción, verificando la revisión base de cada producto: si alguien editó mientras se revisaba, se informa el conflicto y no se aplica a medias.

## Diseño de la carta a medida

- **Qué se guarda**: `businesses.theme` (paleta de 5 colores, letra de títulos y de textos, y 4 opciones de estilo) y `businesses.website_url`. Todo sale de listas cerradas (`src/domain/theme.ts`): nunca hay CSS libre, así que ni la IA ni el dueño pueden inyectar estilos. Sin diseño propio se usa el estándar con `brand_color`.
- **Contraste garantizado**: texto, texto secundario y color de marca deben alcanzar 4.5:1 sobre el fondo y sobre las tarjetas. `themeIssues()` es la regla en la app, `app.is_valid_theme()` la repite en la base como CHECK (una prueba compara las dos con paletas al azar) y `fixTheme()` corrige una paleta cambiando lo mínimo.
- **Propuestas con IA** (`design_requests`, misma cola con lease y reintentos que las importaciones): el worker junta las referencias del local (logo, foto de portada, la primera foto de su última importación y su sitio web) y le pide al proveedor (Gemini o Grok) un diseño con salida estructurada. El modelo no recibe herramientas; la respuesta se valida y se corrige antes de guardarse. El dueño la ve en una vista previa con su carta real y decide si la aplica.
- **Cuándo se pide**: a mano desde *Diseño* (máximo 10 por día por local, una en curso a la vez) y, una sola vez, automáticamente después de la primera importación con fotos.
- **Sitio web**: la URL la escribe el dueño, así que el worker la trata como no confiable (`worker/website.ts`): solo http(s), puertos 80/443, sin credenciales, y cada redirección y cada resolución de DNS se verifican contra direcciones privadas o reservadas (protege de SSRF y DNS rebinding). Límite de tamaño y tiempo; solo se leen hojas de estilo del mismo sitio. Lo extraído (título, colores, tipografías, imagen principal) va al modelo como datos.
- **Sin búsqueda web**: la búsqueda en Google de Gemini no está en el nivel gratuito, así que no se busca al local en internet. Instagram, Facebook y TikTok no se pueden leer sin iniciar sesión: se guardan pero no se usan.
- **Carta pública**: el diseño reemplaza los tokens de color dentro de la carta (también en el diálogo de producto, que se muestra fuera del árbol) y elige las fuentes (`next/font`, sin precarga: cada archivo se descarga solo si una carta lo usa). En fondos oscuros, los colores de estado (abierto, cerrado) se recalculan para seguir siendo legibles. Aplicar o guardar un diseño invalida la caché de las cartas del local.

## Precios masivos

- Por porcentaje o importe fijo, con redondeo por moneda (por ejemplo a $100 en ARS o 0,05 en USD), en toda la carta o en categorías, sobre el **precio general** o sobre el **precio propio de una sucursal**.
- El cálculo es puro y entero (puntos básicos con `BigInt`, sin coma flotante). El servidor recalcula la vista previa con los datos actuales; al aplicar, compara una huella de la vista previa y la base vuelve a verificar cada precio con bloqueo de fila. Si algo cambió, no se aplica nada.
- La vista previa muestra qué sucursales afecta y cuáles conservan su precio propio. Se aplica al borrador (idempotente) y se publica como «Precios masivos».

## Menú del día y promociones

- Programación por fechas (inclusive), días de la semana y franja horaria, en la hora local de cada sucursal. El estado (programada, activa, finalizada o pausada) se calcula con la hora actual; no se guarda.
- Dos menús del día no pueden superponerse en la misma sucursal (lo impide la base); las promociones superpuestas se permiten con advertencia.
- Programar es publicar en diferido: requiere el permiso de publicación y aparece en la carta pública sin republicar.

## Estadísticas

- Visitas a la carta, consultas de productos y búsquedas, agregadas por sucursal, día y hora local. No se guardan IP, user agent, cookies ni identificadores de visitantes.
- `/api/track` descarta bots y vistas previas de enlaces, pedidos de otros orígenes y el tráfico del propio equipo o de la plataforma (si tienen la sesión iniciada); limita eventos por minuto en memoria sin persistir la IP.
- Las consultas indican interés, no ventas, y la UI lo dice explícitamente.

## Suspensión de cuentas

Al suspender (con motivo obligatorio, mostrando el impacto antes de confirmar):

- La carta pública de todas las sucursales responde «Esta carta no está disponible en este momento». Los QR siguen apuntando al mismo lugar.
- El equipo puede entrar en modo de solo lectura; el panel muestra el motivo.
- Las importaciones en cola esperan; no se procesan.
- No se borra ningún dato. Reactivar restablece todo, incluida la última versión publicada.

## Dinero y fechas

- Importes en **enteros de unidades menores** (`bigint` en la base, `number` seguro en TypeScript). Formato con `Intl.NumberFormat` a partir de decimales exactos en texto; nunca se calcula con coma flotante.
- Moneda por negocio; los decimales dependen de la moneda (CLP y PYG sin decimales).
- Fechas en `timestamptz` (UTC); cada sucursal tiene zona horaria IANA para horarios, promociones y estadísticas.

## Auditoría

`audit_log` es de solo inserción: un trigger bloquea las modificaciones y ningún rol de la aplicación tiene permiso de borrar. Registra quién, qué, cuándo y en qué negocio: publicaciones, restauraciones, cambios de equipo, importaciones, precios masivos, promociones y todas las acciones de plataforma. Los dueños y administradores ven la del negocio; la plataforma ve todo.

## Limitaciones conocidas y decisiones

- Los planes se asignan a mano desde la plataforma; no hay cobros.
- El límite de eventos de `/api/track` es por instancia (mejor esfuerzo); los números son orientativos.
- En despliegues con varias instancias fuera de Vercel hace falta un cache handler compartido para que la invalidación de la carta pública llegue a todas.
- Las promociones no admiten franjas que crucen la medianoche (hay que dividirlas en dos).
- No incluye pedidos, pagos, delivery, reservas ni cocina, por diseño.
