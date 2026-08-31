# Outfy

Aplicación social para descubrir actividades, conocer gente con intereses afines y organizar planes reales.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/outfy/src/pages/` — pantallas principales y pantallas de autenticación.
- `artifacts/outfy/src/auth/` — contexto de sesión y cliente de las rutas de autenticación.
- `artifacts/outfy/src/components/` — shell de Outfy, tarjetas, diálogos y componentes compartidos.
- `artifacts/api-server/src/routes/auth.ts` — proxy server-side para Supabase Auth.
- `artifacts/api-server/src/lib/supabase.ts` — cliente server-side con la conexión Supabase de Replit.
- `supabase/migrations/001_profiles.sql` — tabla privada de perfiles y trigger para usernames únicos.
- `supabase/migrations/002_invitation_codes.sql` — códigos de invitación con hash, RLS y consumo atómico.
- `supabase/migrations/003_case_insensitive_usernames.sql` — username visible, forma normalizada e índice único case-insensitive.
- `lib/api-spec/openapi.yaml` — contrato de las rutas compartidas, incluida autenticación.
- `artifacts/outfy/src/index.css` — tokens visuales y estilos de la aplicación.

## Architecture decisions

- La interfaz nunca recibe directamente claves ni tokens de Supabase; el servidor usa la conexión gestionada y entrega una sesión mediante cookies `httpOnly`.
- La aplicación mantiene el nombre de usuario como identificador de acceso, resolviéndolo server-side contra `profiles` antes de llamar a Supabase Auth.
- `profiles.username` conserva el nombre visible y `profiles.username_normalized` aplica `trim + lowercase`; un índice único protege la unicidad también en altas concurrentes.
- La primera versión conserva los planes y páginas sociales como datos mock locales; la autenticación es la primera capacidad real conectada a un servicio externo.
- Las rutas protegidas se resuelven en el cliente después de consultar `/api/auth/session`, mientras que la sesión persiste en cookies y puede renovarse con el refresh token.

## Product

Outfy ofrece Inicio, Explorar, Conexiones, Mensajes y Mi perfil. La experiencia está en español, es responsive y prioriza descubrir planes por encima de las funciones sociales secundarias. El acceso privado incluye registro mediante invitación, login por username, verificación email con OTP de seis cifras y cierre de sesión.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Hay que ejecutar `supabase/migrations/001_profiles.sql` en el proyecto Supabase conectado antes de usar registro/login por username.
- También hay que ejecutar `supabase/migrations/002_invitation_codes.sql` antes de habilitar registros; los códigos se insertan como hashes y se consumen mediante la función SQL protegida.
- La migración guarda el email solo como dato privado de soporte para el login server-side; nunca se expone en respuestas públicas de perfil.
- Si se modifica `lib/api-spec/openapi.yaml`, hay que ejecutar `pnpm --filter @workspace/api-spec run codegen` antes del typecheck.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
