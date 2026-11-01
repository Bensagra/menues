# CartaLista

**Tu carta actualizada, en minutos.** SaaS de menús digitales para restaurantes: crear el negocio y sus sucursales, cargar la carta a mano o desde fotos (leídas con Grok o Gemini), revisar cada cambio, publicar y compartir un QR que nunca cambia.

- Panel del restaurante: cartas, categorías, productos con variantes y extras, precios y disponibilidad por sucursal, actualización con fotos y revisión de cambios, publicación por sucursal con historial y restauración, QR y difusión, estadísticas, menú del día y promociones, precios masivos, equipo con roles, plan y consumo.
- Carta pública por sucursal (`/m/<sucursal>`): rápida, sin cuenta, solo con lo publicado.
- Administración de plataforma (`/admin`): negocios, usuarios, procesamientos, planes y límites, auditoría.

Documentación adicional: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) (diseño, seguridad y decisiones) y [PROGRESS.md](PROGRESS.md) (estado del trabajo).

---

## Requisitos

- Node.js 22 o posterior y npm.
- Docker para Supabase local (Docker Desktop, OrbStack o Colima en macOS).
- La CLI de Supabase viene como dependencia de desarrollo (`npx supabase …`).

## Puesta en marcha local

```bash
npm install
npm run db:start          # Supabase local (Postgres, Auth, Storage, Mailpit)
cp .env.example .env.local
npx supabase status       # copiá PUBLISHABLE_KEY y SECRET_KEY a .env.local
npm run db:reset          # aplica las migraciones y el seed de demostración
npm run dev               # http://localhost:3000
```

Con Colima, antes de los comandos de Supabase: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock`.

- Los emails locales (confirmación de cuenta, recuperación) llegan a **Mailpit**: http://127.0.0.1:54324
- La carta de demostración queda publicada en http://localhost:3000/m/casa-oliva-palermo y `/m/casa-oliva-belgrano`.

### Usuarios de prueba (solo local)

El seed no crea usuarios ni contraseñas. Para entrar al panel de Casa Oliva:

```bash
npm run demo:user -- --email vos@ejemplo.com --role owner
# Otros ejemplos:
npm run demo:user -- --email editor@ejemplo.com --role editor --branches casa-oliva-palermo
npm run demo:user -- --email editora@ejemplo.com --role editor --can-publish
npm run demo:user -- --email ops@ejemplo.com --no-business   # solo la cuenta (para admin:grant)
```

Si no pasás `--password`, se genera una contraseña aleatoria y se muestra una sola vez. El script se niega a correr contra un Supabase que no sea local (salvo `--allow-remote`, a propósito).

También podés registrarte normalmente en `/registrarse` y confirmar el email desde Mailpit.

### Procesar fotos en local

El procesamiento lo hace un **worker** aparte (`npm run worker`). Necesita la clave del proveedor elegido en `.env.local`: `AI_PROVIDER=gemini` con `GEMINI_API_KEY` (tiene nivel gratuito) o `AI_PROVIDER=xai` con `XAI_API_KEY`.

Sin clave, para probar el flujo completo hay un proveedor **simulado** que solo se habilita fuera de producción y siempre se muestra como «Resultado simulado (modo de prueba)»:

```bash
AI_PROVIDER=mock ALLOW_MOCK_AI=true npm run worker
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en modo desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run worker` | Worker de importaciones (proceso continuo) |
| `npm run worker:once` | Procesa la cola una vez y termina (para cron) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Pruebas unitarias |
| `npm run test:integration` | Pruebas de integración contra Supabase local |
| `npm run test:e2e` | Playwright: build de producción en el puerto 3211 + worker simulado |
| `npm run db:start` / `db:stop` | Supabase local |
| `npm run db:reset` | Recrea la base local con migraciones y seed |
| `npm run db:types` | Regenera `src/types/database.ts` desde la base local |
| `npm run admin:grant -- --email …` | Otorga administración de plataforma |
| `npm run admin:revoke -- --email …` | La revoca |
| `npm run demo:user -- …` | Usuario de prueba local para el seed |

La primera vez que corras las pruebas e2e: `npx playwright install chromium`.

## Administrador de plataforma (procedimiento seguro)

No existe registro público de administradores ni credenciales por defecto. El único camino es este:

1. La persona se registra en `/registrarse` con su email y lo confirma.
2. Quien opera la plataforma, desde una máquina de confianza con la clave secreta del proyecto (`SUPABASE_SECRET_KEY` y `NEXT_PUBLIC_SUPABASE_URL` del entorno correspondiente), ejecuta:

   ```bash
   npm run admin:grant -- --email persona@empresa.com --note "Soporte"
   ```

3. La persona entra a `/admin`. Toda acción queda en la auditoría con su identidad (no hay suplantación de cuentas; el panel muestra un banner fijo de "Administración de la plataforma").

Para quitar el acceso: `npm run admin:revoke -- --email persona@empresa.com`.

## Datos de demostración

`supabase/seed.sql` (solo local, lo aplica `npm run db:reset`): negocio **Casa Oliva** con sucursales **Palermo** y **Belgrano**, categorías Entradas, Principales, Pizzas, Postres y Bebidas, productos con variantes y extras, algunos agotados, precios propios de Belgrano y la carta publicada en ambas sucursales. El seed no se aplica en producción.

## Supabase alojado (producción)

> Aplicar migraciones en un proyecto real es una acción sobre un servicio externo: revisá cada paso antes de ejecutarlo.

1. Creá el proyecto en Supabase y anotá la URL, la clave publicable (`sb_publishable_…`) y la clave secreta (`sb_secret_…`).
2. Migraciones (son aditivas; ninguna borra datos):

   ```bash
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase db push        # no aplica el seed
   ```

3. **Auth** (Dashboard → Authentication):
   - *URL Configuration*: Site URL = tu `NEXT_PUBLIC_APP_URL`; Redirect URLs: `https://tu-dominio/**`.
   - *Sign In / Providers → Email*: confirmación de email activada; contraseña de al menos 8 caracteres con letras y números (igual que `supabase/config.toml`).
   - *Emails → Templates*: copiá los de `supabase/templates/` (confirmación, recuperación, cambio de email, enlace mágico). Los enlaces deben ir a `/auth/confirm?token_hash=…&type=…`.
   - *SMTP*: configurá un proveedor propio; el SMTP incluido tiene límites muy bajos.
4. **Storage**: los buckets (`import-originals` y `uploads` privados, `public-media` público con rutas no adivinables) los crea la migración. No agregues políticas públicas.
5. Primer administrador: ver el procedimiento de arriba.

## IA para leer fotos

Hay dos proveedores reales, que se eligen con `AI_PROVIDER`. Los dos usan las mismas instrucciones y el mismo esquema, no reciben herramientas, y su salida se vuelve a validar en el servidor. Cambiar de uno a otro no requiere tocar la base ni la app.

### Gemini (Google) · `AI_PROVIDER=gemini`

1. Creá una clave en https://aistudio.google.com/apikey y cargala como `GEMINI_API_KEY` **en el worker**.
2. `GEMINI_MODEL` (por defecto `gemini-3.5-flash`). En noviembre de 2026 fue el más estable en las pruebas: 6 a 45 s por foto. `gemini-3.8-flash` también lee bien, pero tardaba 2 a 3 minutos y respondía seguido «demanda alta» (503). `gemini-2.5-*` ya no está disponible para claves nuevas.
3. **Nivel gratuito**: sin tarjeta, con un límite diario de pedidos que Google muestra en AI Studio. Si se agota, el worker reintenta con la espera que indica Google y, tras `IMPORT_MAX_ATTEMPTS` intentos, la importación queda como fallida y la cuota del plan se libera. En el nivel gratuito Google puede usar el contenido enviado para mejorar sus productos (una carta es información pública). Con facturación activada en el proyecto de Google ya no hay límite diario, pero se cobra por uso.
4. El adaptador usa `generateContent` con `store: false`, `responseJsonSchema`, resolución de imagen alta y la clave en el encabezado `x-goog-api-key`. Gemini rechaza los esquemas con muchos `maxItems` anidados, así que se envían sin ellos; los límites los aplica la validación del servidor.
5. Prueba real opcional: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 GEMINI_LIVE_TEST=1 npm run test:integration -- gemini-live`.

### Grok (xAI) · `AI_PROVIDER=xai`

1. Creá una API key en la consola de xAI (empieza con `xai-`) y cargala como `XAI_API_KEY` **en el worker** (también puede estar en el servidor web, pero no es necesario). La API se paga por uso: cargá crédito en *Billing*.
2. `XAI_MODEL` (por defecto `grok-4.7`) debe ser un modelo con comprensión de imágenes y salida estructurada; verificá el nombre vigente en la documentación de xAI. `XAI_REASONING_EFFORT` es opcional.
3. El adaptador usa la Responses API con `store: false`, sin herramientas y con esquema JSON estricto; la salida se vuelve a validar en el servidor. El texto de las fotos se trata como datos: instrucciones escritas en una imagen no cambian el comportamiento.
4. Límites de uso: cada plan define fotos por mes y por importación; la cuota se reserva de forma atómica al enviar y se libera si el procesamiento falla.
5. Prueba real opcional (consume tokens): `XAI_API_KEY=… XAI_LIVE_TEST=1 npm run test:integration -- xai-live`.

Sin clave, la carga manual, la publicación y la carta pública funcionan igual; la opción de fotos se muestra como «necesita configuración».

## Worker en producción

Es un proceso Node de larga duración, independiente de la app web:

```bash
npm ci && npm run worker
```

- Variables: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `AI_PROVIDER` y la clave y el modelo de ese proveedor (`GEMINI_*` o `XAI_*`), más los opcionales `WORKER_*` e `IMPORT_*` de `.env.example`.
- Hosting: cualquier servicio que mantenga un proceso vivo (Railway, Fly.io, Render, una VM con systemd o un contenedor). Alternativa: `npm run worker:once` desde un cron cada minuto (menos inmediato).
- Se pueden correr varias instancias: cada trabajo se toma con `FOR UPDATE SKIP LOCKED`, lease y token; si un worker muere, el lease vence y otro lo retoma.
- Ante `SIGTERM` deja terminar los trabajos en curso (hasta 25 s).
- Envía latidos cada 30 s: el panel de administración muestra si está activo y si el proveedor es real o simulado.
- Cancela solo las importaciones abandonadas durante la subida (`IMPORT_UPLOAD_TTL_MINUTES`) y borra sus fotos.

## Despliegue de la app web

- Pensada para Vercel (Next.js 16 con Cache Components); también funciona con `next start` en cualquier host Node.
- Variables: `NEXT_PUBLIC_APP_URL` (dominio definitivo: **los QR impresos apuntan ahí**), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. La clave secreta y la de xAI nunca llevan prefijo `NEXT_PUBLIC_`.
- La carta pública se cachea con etiquetas por sucursal y se invalida al publicar. Si corrés varias instancias fuera de Vercel, configurá un cache handler compartido para que la invalidación llegue a todas.

## Checklist de variables y servicios

| Qué | Dónde | Estado en este entorno |
|---|---|---|
| Proyecto Supabase alojado (URL, publicable, secreta) | App y worker | Configurado |
| Migraciones aplicadas en el proyecto alojado | Supabase | Aplicadas |
| Auth: Site URL, Redirect URLs, plantillas de email | Dashboard de Supabase | Pendiente |
| SMTP propio para emails | Supabase | Pendiente |
| Proveedor de IA y su clave (`GEMINI_API_KEY` o `XAI_API_KEY`) | Worker | Gemini configurado en desarrollo (nivel gratuito); la clave de Grok recibida fue rechazada por xAI |
| Host del worker (proceso continuo o cron) | Railway/Fly/VM… | Pendiente |
| Dominio definitivo para `NEXT_PUBLIC_APP_URL` | Hosting de la app | Pendiente (definirlo antes de imprimir QR) |
| Primer administrador de plataforma | `npm run admin:grant` | Pendiente en producción |

## Estructura

```
src/app/            Rutas (panel, admin, carta pública /m, impresión, auth, /api/track)
src/components/     UI por módulo (editor, imports, menu, admin, stats, prices, promotions…)
src/domain/         Lógica pura y probada: dinero, fechas, diff de importaciones, permisos, precios masivos, promociones
src/server/         Acciones de servidor, consultas, autenticación, caché, clientes de Supabase
src/ai/             Proveedores de extracción (xAI y simulado) y prompt
worker/             Worker de importaciones
supabase/           Migraciones, seed, plantillas de email y config local
scripts/            Administración de plataforma y usuarios de prueba
tests/              Unitarias, integración (Supabase local) y e2e (Playwright)
```
