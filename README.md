# Mastery — Smart Document Processing

*(README / documentation: English.)*

This repo is a full-stack app for working through invoices and purchase orders: you upload PDFs, CSV/TXT, or images, the backend pulls out structured fields, runs validation, and you review or fix anything before marking a document validated or rejected.

There are three moving parts in the codebase:

- **`web`** — Angular UI (upload, lists, detail/review).
- **`api`** — NestJS, PostgreSQL via Prisma, JWT auth, file uploads, Swagger.
- **`ocr-api`** — separate Python/FastAPI service that turns uploaded images into text/structured line hints before the main API parses them.

**Why Tesseract by default:** I first wired in a heavier OCR stack (EasyOCR / PyTorch). On small Railway tiers it blew memory limits — workers got killed or never finished. So the production-friendly path is **Tesseract**: low RAM, good enough for many scans, but not the best choice for messy tables or poor scans. EasyOCR remains optional if you build the Docker image with the extra deps and set `OCR_ENGINE=easyocr` on a machine that can handle it.

---

## Live apps

- **Frontend:** [https://web-nu-ten-40.vercel.app/login](https://web-nu-ten-40.vercel.app/login)
- **Main API (Swagger):** [https://mastery-production-9a44.up.railway.app/docs](https://mastery-production-9a44.up.railway.app/docs)
- **OCR API (Swagger):** [https://awake-art-production-6ef7.up.railway.app/docs](https://awake-art-production-6ef7.up.railway.app/docs)

Production checklist that bites people in practice: set the Nest **`FRONTEND_BASE_URL`** to your Vercel origin for CORS, point **`API_URL`** at the public API when you build the Angular app, and make sure **`OCR_SERVICE_URL`** on the API host points at wherever the OCR container/service actually runs.

---

## What you need locally

- Node 20+ (CI uses 22)
- npm
- PostgreSQL 14+ if you run the API outside Docker
- For **ocr-api** on your machine: Python 3.11+ and a system **Tesseract** install (Windows: `winget install UB-Mannheim.TesseractOCR`, or set **`TESSERACT_CMD`** to the full path of `tesseract.exe`)

---

## Run locally (four processes)

**1. Postgres** — whatever you prefer (installer, Docker only for Postgres, etc.).

**2. API**

```bash
cd api
cp .env.example .env
```

Fill in `DATABASE_URL`, JWT secrets, `FRONTEND_BASE_URL` (e.g. `http://localhost:4200`). For image uploads you want OCR running too:

```env
OCR_SERVICE_URL=http://127.0.0.1:8000
OCR_SERVICE_TIMEOUT_MS=120000
```

Then:

```bash
npm install
npx prisma migrate deploy
npm run start:dev
```

API listens on **http://localhost:3000**. Swagger UI: **http://localhost:3000/docs** (there is also a redirect from `/api/docs`).

**3. OCR API**

```bash
cd ocr-api
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS / Linux: source .venv/bin/activate
pip install -r requirements.txt
# Windows (CMD):
set PORT=8000
# macOS / Linux:
export PORT=8000
python main.py
```

Defaults to Tesseract; Swagger at **http://127.0.0.1:8000/docs**.

**4. Web**

```bash
cd web
npm install
npm start
```

Open **http://localhost:4200**. Dev environment already targets `http://localhost:3000`.

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
- OCR API — http://localhost:8000/docs  

Stop with Ctrl+C, then `docker compose down`. Add `-v` if you want to wipe the Postgres volume too.

Inside the compose network the Nest service talks to OCR at **`http://ocr-api:8000`** — already set in `docker-compose.yml`.

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

How Vercel and Railway pick up new revisions depends on how you connected those projects to the repo — this workflow publishes images to GHCR; the OCR service on Railway is usually deployed from the `ocr-api` Dockerfile or the same pipeline you configure there.

---

## Misc

Uploaded files land under `api/uploads/` relative to the API process unless you override **`UPLOAD_DIR`**.
