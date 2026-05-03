# Mastery — Smart Document Processing

*(README / documentation: English.)*

This repo is a full-stack app for working through invoices and purchase orders: you upload PDFs, CSV/TXT, or images, the backend pulls out structured fields, runs validation, and you review or fix anything before marking a document validated or rejected.

There are three moving parts in the codebase:

- **`web`** — Angular UI (upload, lists, detail/review).
- **`api`** — NestJS, PostgreSQL via Prisma, JWT auth, file uploads, Swagger. **Image OCR runs here via [Mistral OCR](https://docs.mistral.ai/capabilities/ocr)** (API call from the server using `MISTRAL_API_KEY`), not client-side or local Tesseract.js.
- **`ocr-api`** *(optional)* — standalone Python/FastAPI service (Tesseract / optional EasyOCR) kept in the repo for experiments or custom deployments; the main app does **not** call it unless you wire that yourself.

**Why Mistral OCR:** Recognition quality on invoices and messy scans is much better than the old **Tesseract.js** path, without shipping native OCR binaries or heavy ML stacks on the API host. Trade-off: you need a Mistral API key and outbound HTTPS to `api.mistral.ai` (or your configured `MISTRAL_API_BASE`).

---

## Live apps

- **Frontend:** [https://web-nu-ten-40.vercel.app/login](https://web-nu-ten-40.vercel.app/login)
- **Main API (Swagger):** [https://mastery-production-9a44.up.railway.app/docs](https://mastery-production-9a44.up.railway.app/docs)
- **Standalone OCR API (Swagger, optional Python/Tesseract):** [https://awake-art-production-6ef7.up.railway.app/docs](https://awake-art-production-6ef7.up.railway.app/docs) — not used by the main Nest pipeline; production image OCR is **Mistral** on the main API with **`MISTRAL_API_KEY`**.

Production checklist that bites people in practice: set the Nest **`FRONTEND_BASE_URL`** to your Vercel origin for CORS, point **`API_URL`** at the public API when you build the Angular app, and set **`MISTRAL_API_KEY`** on the API host so image uploads can be OCR’d (optional overrides: `MISTRAL_OCR_MODEL`, `MISTRAL_OCR_TIMEOUT_MS`, `MISTRAL_API_BASE`).

---

## What you need locally

- Node 20+ (CI uses 22)
- npm
- PostgreSQL 14+ if you run the API outside Docker
- A **Mistral API key** if you want image/PDF-page OCR in **`api`** (same features as production). Optional: only if you run **`ocr-api`** locally — Python 3.11+ and a system **Tesseract** install (Windows: `winget install UB-Mannheim.TesseractOCR`, or set **`TESSERACT_CMD`** to the full path of `tesseract.exe`).

---

## Run locally (three processes)

**1. Postgres** — whatever you prefer (installer, Docker only for Postgres, etc.).

**2. API**

```bash
cd api
cp .env.example .env
```

Fill in `DATABASE_URL`, JWT secrets, `FRONTEND_BASE_URL` (e.g. `http://localhost:4200`). For image uploads, add your Mistral credentials:

```env
MISTRAL_API_KEY=your-key-here
# Optional:
# MISTRAL_OCR_MODEL=mistral-ocr-latest
# MISTRAL_API_BASE=https://api.mistral.ai
# MISTRAL_OCR_TIMEOUT_MS=120000
```

Then:

```bash
npm install
npx prisma migrate deploy
npm run start:dev
```

API listens on **http://localhost:3000**. Swagger UI: **http://localhost:3000/docs** (there is also a redirect from `/api/docs`).

**3. Web**

```bash
cd web
npm install
npm start
```

Open **http://localhost:4200**. Dev environment already targets `http://localhost:3000`.

**Optional — standalone `ocr-api` (Python / Tesseract):** not required for the Nest app’s Mistral OCR. If you run it anyway: `cd ocr-api`, create a venv, `pip install -r requirements.txt`, set `PORT=8000`, run `python main.py` — Swagger at **http://127.0.0.1:8000/docs** (defaults to Tesseract).

---

## Docker Compose (everything together)

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose on Linux).

From the **repo root**:

```bash
cp .env.docker.example .env
```

On Windows: `copy .env.docker.example .env`

Edit `.env`: strong JWT secrets, optional SendGrid; **`API_URL`** is injected when building the web image (default `http://localhost:3000` is fine for hitting the API from your browser on the same machine). Compose reads **`mastery/.env`** at the root — not `api/.env`.

Start:

```bash
docker compose up --build
```

Then:

- Web — http://localhost:4200  
- API — http://localhost:3000  
- API Swagger — http://localhost:3000/docs  
- Optional OCR API — http://localhost:8000/docs (Python/Tesseract container; the Nest API uses **Mistral** via `MISTRAL_API_KEY`, not this service)

Stop with Ctrl+C, then `docker compose down`. Add `-v` if you want to wipe the Postgres volume too.

Set **`MISTRAL_API_KEY`** in your root `.env` (or shell) when running Compose so the `api` service can call Mistral OCR.

---

## Production web build

The prebuild script needs **`API_URL`**:

```bash
cd web
# Windows (CMD):
set API_URL=https://mastery-production-9a44.up.railway.app
# macOS / Linux:
export API_URL=https://mastery-production-9a44.up.railway.app
npm run build
```

(Vercel should define the same variable in project settings.)

---

## GitHub Actions

- **CI** runs on pushes and pull requests: installs and builds **`api`** and **`web`**, and sanity-builds the Dockerfiles for those two (no push to a registry).
- **CD** runs on pushes to **`main`** (and can be triggered manually): builds and **pushes** Docker images for `api` and `web` to **GitHub Container Registry** (`ghcr.io`, `latest` + git SHA tags).

How Vercel and Railway pick up new revisions depends on how you connected those projects to the repo — this workflow publishes images to GHCR. Image OCR in production relies on **`MISTRAL_API_KEY`** on the API service; an optional **`ocr-api`** deploy on Railway is unrelated unless you integrate it yourself.

---

## Misc

Uploaded files land under `api/uploads/` relative to the API process unless you override **`UPLOAD_DIR`**.
