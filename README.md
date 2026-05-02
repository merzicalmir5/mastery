# Mastery

Small full-stack app for uploading invoices and purchase orders (PDF, CSV, TXT, or images), extracting structured fields, running server-side validation, and reviewing or correcting data before you mark a document as validated or rejected.

The repo splits into two folders:

- **`api`** — NestJS, PostgreSQL via Prisma, JWT auth, file uploads, Swagger UI  
- **`web`** — Angular dashboard (upload, lists, detail/review, overview)

I usually run Postgres locally (Docker or a native install), point `DATABASE_URL` at it, run migrations once, then start the API and the SPA in two terminals.

---

## Live deployment

Public URLs (no Docker required to try the hosted app):

- **Web (frontend):** [https://web-nu-ten-40.vercel.app/login](https://web-nu-ten-40.vercel.app/login)  
- **API (backend + Swagger):** [https://mastery-production-9a44.up.railway.app/](https://mastery-production-9a44.up.railway.app/) — Swagger UI is at `/api/docs`.

For production, the API’s `FRONTEND_BASE_URL` must match the Vercel origin (CORS), and the web production build must set **`API_URL`** to the public API base URL (see **Production build** under Web).

---

## Run everything with Docker (full stack locally)

Share these steps with anyone who clones the repo and wants Postgres + API + web in one go.

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine + Compose on Linux.

From the **repository root** (the folder that contains `docker-compose.yml`):

```bash
cp .env.docker.example .env
```

On **Windows (PowerShell or CMD):** `copy .env.docker.example .env`

Then edit `.env` (strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`; optional SendGrid; change `API_URL` only if the browser should call a different API base than `http://localhost:3000`). Start the stack:

```bash
docker compose up --build
```

Then open:

- **App:** [http://localhost:4200](http://localhost:4200)  
- **API / Swagger:** [http://localhost:3000](http://localhost:3000) and [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

Stop containers: `Ctrl+C`, then `docker compose down`. To remove database volumes as well: `docker compose down -v`.

**Note:** Compose reads **`mastery/.env`** at the repo root (not `api/.env`). Variables like `${JWT_ACCESS_SECRET}` and `${API_URL}` are substituted into `docker-compose.yml`. For local development without Docker, use `api/.env` and `npm start` in `api` / `web` as below.

---

## Prerequisites

- Node.js 20+ (what I used; slightly older LTS usually works)  
- npm  
- PostgreSQL 14+ (any recent version is fine)

---

## API setup

```bash
cd api
cp .env.example .env
# Edit .env: DATABASE_URL, JWT secrets, FRONTEND_BASE_URL, optional UPLOAD_DIR
npm install
npx prisma migrate deploy
npm run start:dev
```

Defaults assume the API on **http://localhost:3000** and the SPA on **http://localhost:4200**.

**Swagger:** open [http://localhost:3000/api/docs](http://localhost:3000/api/docs) — log in via `POST /auth/login`, copy the access token, click *Authorize*, paste the token.

Uploaded files land under `uploads/` from the API process (or `UPLOAD_DIR` if you set it).

---

## Web setup

```bash
cd web
npm install
npm start
```

Then open [http://localhost:4200](http://localhost:4200). The dev config points `apiUrl` at `http://localhost:3000` (see `src/environments/environment.development.ts`).

### Production build

The build script reads **`API_URL`** from the environment and writes `environment.prod.generated.ts` (see `web/scripts/write-api-env.mjs`). On Vercel, define `API_URL` in the project env vars or the build will fail on purpose.

```bash
cd web
set API_URL=https://your-api.example.com
npm run build
```

Serve the `dist/` output behind HTTPS and keep the API’s `FRONTEND_BASE_URL` in sync.

---