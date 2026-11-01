# CartaLista — progreso

Archivo vivo: qué está terminado, qué falta y qué está bloqueado.

## Decisiones de arquitectura (resumen)

- **Stack**: Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript, Tailwind 4, shadcn/ui sobre Radix, Supabase (Postgres 17 + Auth + Storage), Zod 4, Vitest 5, Playwright 1.64.
- **Escrituras**: todas las mutaciones pasan por funciones Postgres (RPC) con autorización explícita, validación, auditoría y transacción. Los usuarios autenticados solo tienen `SELECT` (RLS); no hay `INSERT/UPDATE/DELETE` directos. `anon` solo ejecuta `get_public_menu` y `get_invitation`.
- **Lecturas**: Server Components con el JWT del usuario (RLS). La carta pública solo se lee con `get_public_menu` (versiones publicadas) y se cachea con `use cache` + `cacheTag`; publicar invalida con `updateTag`.
- **Cola de trabajos**: la tabla `imports` es la cola (estado persistente, `FOR UPDATE SKIP LOCKED`, lease con token, reintentos con backoff, máximo 2 trabajos simultáneos por negocio). Worker Node: `npm run worker` (o `--once` desde un cron).
- **IA**: dos proveedores reales detrás de la misma interfaz, elegidos con `AI_PROVIDER`. **xAI** sobre la Responses API (`POST /v1/responses`), con `XAI_MODEL` (por defecto `grok-4.7`) y salida estructurada `json_schema` estricta. **Gemini** sobre `generateContent`, con `GEMINI_MODEL` (por defecto `gemini-3.5-flash`), `responseJsonSchema` y nivel gratuito. En los dos: `store: false` y sin herramientas. Validación con Zod + reinterpretación de precios. Proveedor simulado solo en pruebas o con `ALLOW_MOCK_AI=true` (siempre etiquetado).
- **Dinero**: enteros en unidades menores; formato con `Intl.NumberFormat` usando decimales exactos en texto.
- **Fechas**: `timestamptz` (UTC); zona horaria IANA por sucursal.

## Terminado y verificado

- [x] Migraciones: multitenancy con FKs compuestas, catálogo, versiones inmutables, importaciones, RLS, RPC, Storage, privilegios.
- [x] Seed de demostración (Casa Oliva, Palermo y Belgrano, precios propios de Belgrano) separado de producción.
- [x] Autenticación: registro con confirmación de email, ingreso, salida, recuperación y cambio de contraseña, sesión vencida (`volver`), proxy.
- [x] Onboarding: negocio + primera sucursal + carta; elección carga manual / fotos.
- [x] Panel: shell desktop/mobile, sucursal activa, Inicio con estado real (sin métricas inventadas).
- [x] Editor manual: cartas (crear, duplicar, archivar), categorías (crear, renombrar, reordenar, eliminar moviendo productos), productos (variantes, extras, etiquetas confirmadas, foto, estado, duplicar, archivar), búsqueda y filtros, precios por sucursal, cambios sin guardar, conflictos de edición.
- [x] Publicación atómica e idempotente por sucursal, vista previa del borrador, detalle de cambios.
- [x] Carta pública: con y sin fotos, detalle, búsqueda sin resultados, no publicada, inexistente, no disponible, error de conexión, local cerrado, metadatos y OG.
- [x] QR y difusión: enlace permanente, copiar, PNG/SVG, vista imprimible.
- [x] Importación con fotos: carga (cámara, selección, arrastrar, varias páginas, reordenar, girar, quitar), alcance, validación real del archivo, cuota atómica, worker con etapas reales, reintentos, cancelación, revisión (imagen con zoom, filtros, resumen, aprobar/corregir/descartar, aprobación en conjunto), aplicación transaccional con conflictos, publicación.
- [x] Pruebas: unitarias y de integración contra Supabase local (aislamiento, visitantes, privilegios, roles, importaciones, publicación, restauración, cuota concurrente, invitaciones, estadísticas, precios masivos, promociones).

- [x] Historial (comparar y restaurar como publicación nueva), Configuración (local, sucursales, equipo, plan), cuenta, invitación por enlace.
- [x] Administración de plataforma: Resumen, Negocios (alta con invitación al propietario, búsqueda y filtro), Detalle (plan, consumo, sucursales, equipo, importaciones con reintento idempotente, suspender/reactivar mostrando el impacto antes de confirmar), Usuarios, Procesamientos, Planes y límites, Auditoría con filtros. Banner visible y sin suplantación.
- [x] Privilegios por defecto: toda función nueva nace sin EXECUTE para anon/authenticated (prueba de regresión incluida).
- [x] Estadísticas: `/api/track` (sin IP, cookies ni user agent guardados; descarta bots, otros orígenes y el tráfico del equipo/plataforma; límite por minuto), contadores por hora local, pantalla con visitas por día/semana, por hora y productos más consultados, con tabla equivalente.
- [x] Precios masivos: porcentaje o importe, redondeo por moneda, alcance por categorías, precio general o propio de una sucursal, vista previa calculada en el servidor, aplicación atómica e idempotente con detección de cambios, y publicación como «Precios masivos».
- [x] Menú del día y promociones: fechas, días y franja en la hora de cada sucursal; estados programada/activa/finalizada/pausada; menús del día superpuestos bloqueados y promociones superpuestas advertidas; visibles en la carta pública sin republicar.
- [x] Carta imprimible desde la versión publicada (una o dos columnas, con o sin descripciones, QR al pie).

- [x] Pulido: plurales, aviso de sucursales afectadas al editar un precio compartido, limpieza automática de subidas abandonadas (cancela y borra las fotos), estado visual de la opción de fotos sin IA, panel de plataforma sin desbordes en mobile.
- [x] Adaptador de xAI probado con un fetch simulado (formato del pedido, `store: false`, sin herramientas, esquema estricto, errores 429/401/5xx/400, negativas, respuestas incompletas o fuera del esquema). Prueba real opcional (`XAI_LIVE_TEST=1`).
- [x] Pruebas e2e con Playwright contra build de producción: registro → configuración → carga manual → publicación → consulta pública; importación con proveedor simulado → revisión (precio ilegible corregido a mano) → publicación; carta pública en mobile.
- [x] Proveedor Gemini (nivel gratuito de Google) como alternativa a Grok: adaptador probado con un fetch simulado (pedido, clave en el encabezado, esquema sin `maxItems`, partes de razonamiento, errores 429 con RetryInfo, clave inválida, 503, bloqueos, respuestas cortadas) y con una prueba real (`GEMINI_LIVE_TEST=1`). Funcionó con una importación real en el proyecto alojado: 1 foto, 101 propuestas en 44 s.
- [x] Diseño de la carta a medida: paleta, letras y estilo de listas cerradas con contraste AA garantizado (app y base); propuestas con IA a partir del logo, la portada, la foto de la carta y el sitio web (lectura del sitio protegida contra SSRF); vista previa con la carta real en un teléfono; aplicar, ajustar a mano, corregir contraste y volver al estándar; propuesta automática tras la primera importación; aviso en el inicio del panel; sitio web en el alta del local.
- [x] Documentación: README (instalación, comandos, Supabase local y alojado, Storage, Grok, worker, administrador de plataforma, usuarios de prueba, despliegue, checklist), `docs/ARQUITECTURA.md`, `.env.example` sin secretos.

## Verificación (última corrida)

- 1 nov 2026, diseño a medida: `tsc` y ESLint sin errores; 137 pruebas unitarias y 56 de integración pasan (más las 2 reales de IA, que solo corren a pedido); 4 de 4 e2e pasan, con el build de producción incluido (con el flujo nuevo de diseño); la prueba real de propuesta de diseño pasa con `gemini-3.8-flash`; migración `20261101000100_menu_design` aplicada en el proyecto alojado; propuesta real generada para el primer local a partir de la foto de su carta; revisión visual en desktop y en 390 px, con fondo claro y oscuro.
- Hallazgo: el nivel gratuito de Gemini permite 20 pedidos por día por modelo. Hay respaldo automático entre modelos (`GEMINI_FALLBACK_MODELS`).
- 1 nov 2026, cambio de proveedor Gemini: `tsc` sin errores; ESLint sin errores; 116 pruebas unitarias pasan; la prueba real de Gemini pasa; una importación real en el proyecto alojado quedó lista para revisar. Las pruebas de integración y e2e no se volvieron a correr, porque no tocan este cambio (usan el proveedor simulado). Lo que sigue es de la corrida completa anterior:
- `npx tsc --noEmit`: sin errores.
- `npx eslint .`: sin errores ni advertencias.
- `npx vitest run`: 157 pruebas pasan (unitarias + integración contra Supabase local); 1 omitida a propósito (prueba real de xAI, sin clave).
- `npx playwright test`: 3 de 3 pasan (build de producción en el puerto 3211 + worker simulado).
- `next build`: compila sin advertencias.
- Revisión visual en desktop y mobile (390 px): carta pública, panel, estadísticas, precios masivos, promociones, impresión y panel de plataforma.

## Pendiente (no bloquea el uso local)

- Pruebas e2e del panel de plataforma y de promociones (hoy cubiertas por integración y revisión manual).
- Cache handler compartido si se despliega en varias instancias fuera de Vercel.

## Bloqueado / requiere configuración externa

- Supabase alojado: configurado y con las migraciones aplicadas. Falta configurar Auth en el dashboard (Site URL, Redirect URLs, plantillas).
- Grok: la clave recibida (`grok_…`) fue rechazada por xAI; las claves de la API empiezan con `xai-`. Mientras tanto, las fotos se procesan con Gemini (`AI_PROVIDER=gemini`).
- SMTP propio en Supabase para emails de producción (el SMTP por defecto de Supabase tiene límites bajos).
