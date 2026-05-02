# Document OCR API — returns JSON/text from images (FastAPI + EasyOCR). EasyOCR needs libGL etc. for OpenCV.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV PORT=8000
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD sh -c 'uvicorn main:app --host 0.0.0.0 --port ${PORT}'
