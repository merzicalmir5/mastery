# OCR API: default build = Tesseract only (small RAM). EasyOCR optional at build time.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# EasyOCR/OpenCV deps only when installing easyocr (second stage could skip — kept for optional ARG build)
ARG INSTALL_EASYOCR=false

RUN if [ "$INSTALL_EASYOCR" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libsm6 libxext6 libgl1 libgomp1 \
      && rm -rf /var/lib/apt/lists/* ; \
    fi

WORKDIR /app

COPY requirements.txt requirements-full.txt ./

RUN if [ "$INSTALL_EASYOCR" = "true" ]; then \
      pip install --no-cache-dir -r requirements-full.txt ; \
    else \
      pip install --no-cache-dir -r requirements.txt ; \
    fi

COPY main.py .

ENV PORT=8000
ENV PYTHONUNBUFFERED=1
# Default engine for Railway free tier / low RAM (no PyTorch in slim image)
ENV OCR_ENGINE=tesseract

EXPOSE 8000

CMD sh -c 'uvicorn main:app --host 0.0.0.0 --port ${PORT}'
