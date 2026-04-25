# Backend Runbook

## Runtime

Cricchetto now runs as a minimal Next.js App Router backend in `apps/web`.

Root npm scripts load the repo-root `.env` with Node's built-in `--env-file=.env` support, then start/build the Next app from `apps/web`.

## Local start

```powershell
npm install
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

Required runtime env names remain `Criccheto_*`:

- `Criccheto_SUPABASE_URL`
- `Criccheto_SUPABASE_SERVICE_ROLE_KEY`
- `Criccheto_INTERNAL_API_SECRET`
- `Criccheto_BACKEND_BASE_URL`
- `Criccheto_DOCUMENTS_BUCKET`

Optional dashboard-specific env names:

- `Criccheto_DASHBOARD_API_SECRET` defaults to `Criccheto_INTERNAL_API_SECRET` when unset.
- `Criccheto_DASHBOARD_WORKSHOP_ID` can pin the dashboard to one workshop. When unset, the first workshop by `created_at` is used.

## Internal endpoints

These backend endpoints are mounted by Next.js and require `x-internal-secret`:

- `POST /api/internal/messages/process-inbound`
- `POST /api/internal/messages/send-outbound-result`
- `POST /api/internal/reminders/run`
- `POST /api/internal/documents/run`
- `POST /api/internal/intake/expire-cleanup`

## Dashboard endpoints

These dashboard read endpoints are mounted by Next.js and require `x-dashboard-secret`:

- `GET /api/dashboard/overview`
- `GET /api/dashboard/plate/[plate]`
- `GET /api/work-orders/[id]`
- `GET /api/work-orders/open`
- `GET /api/work-orders/ready`
- `GET /api/revisions/upcoming`

Thin mutation endpoints are also mounted for backend-mediated dashboard writes:

- `POST /api/work-orders/[id]/notes`
- `POST /api/work-orders/[id]/items`
- `PATCH /api/vehicles/[id]/revision`
- `POST /api/work-orders/[id]/actions/close`
- `POST /api/work-orders/[id]/actions/collect`

## VPS start

```powershell
npm ci
npm run build
npm run start
```

Run the process behind the existing VPS reverse proxy and point n8n to the public base URL that reaches this Next app. Keep `/dashboard` behind the VPS access controls already used for internal operations until product authentication is added.

## Telegram smoke

With the backend running locally:

```powershell
$env:Criccheto_BACKEND_BASE_URL="http://localhost:3000"
node apps/web/scripts/manual-backend-smoke.mjs
```

The smoke script uses Telegram-test normalized messages and calls the internal endpoints through `Criccheto_INTERNAL_API_SECRET`.
