# Y/CS Unified Backend

Unified backend services for Yale Computer Society projects.

## Quick start
- Copy `.env.example` to `.env` and fill values.
- Install deps: `pnpm install`
- Start Redis: `docker compose up -d`
- Start Supabase: `supabase start`
- Run dev servers: `pnpm dev`

## Useful scripts
- `pnpm build` - build all packages and apps
- `pnpm lint` - run lint across workspace
- `pnpm clean` - clean all build outputs
- `pnpm db:migrate` - push migrations
- `pnpm db:generate-types` - generate Supabase types
