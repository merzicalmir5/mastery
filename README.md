# Mastery

Small full-stack app for uploading invoices and purchase orders (PDF, CSV, TXT, or images), extracting structured fields, running server-side validation, and reviewing or correcting data before you mark a document as validated or rejected.

The repo splits into two folders:

- **`api`** — NestJS, PostgreSQL via Prisma, JWT auth, file uploads, Swagger UI  
- **`web`** — Angular dashboard (upload, lists, detail/review, overview)

I usually run Postgres locally (Docker or a native install), point `DATABASE_URL` at it, run migrations once, then start the API and the SPA in two terminals.

---

## Live deployment

After you ship to your host(s), drop the links here so reviewers can open the app without cloning:

- **Web:** *(not deployed yet — e.g. `https://…vercel.app`)*  
- **API:** *(not deployed yet — e.g. `https://…railway.app`)*  

For production, set the API’s `FRONTEND_BASE_URL` to your real SPA origin (CORS), and build the web app with `API_URL` pointing at the public API base URL (see the **Production build** subsection under Web).

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

## What we skipped on purpose

No Docker Compose file in this tree yet — you can add one around the same Postgres + API + web flow if you want a one-command demo.

---

## License

Private / coursework — adjust if you publish publicly.
