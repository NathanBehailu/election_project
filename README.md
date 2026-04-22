# Election App

School election portal with static pages and an API backed by Supabase.

## Requirements

- Node.js 20+
- Supabase project with the schema from `supabase.sql`

## Environment Variables

Create a `.env` file:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
PORT=3000
```

Notes:
- Use the project base URL (do not include `/rest/v1`).
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed in frontend code.

## Local Development

```bash
npm install
npm start
```

App runs at `http://localhost:3000`.

## Vercel Deployment

This repo is configured for a single serverless API handler:

- API routes: `/api/*` -> `api/index.js` -> `server.js`
- Static assets/pages served directly from the project root

Steps:

1. Import the repository in Vercel.
2. Set environment variables in Vercel project settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy.

Optional local Vercel simulation:

```bash
npm run vercel:dev
```

## Data Migration

- Run `supabase.sql` in Supabase SQL Editor to create and seed tables.
- Files under `data/` are legacy CSV snapshots and are no longer used by the runtime API.
