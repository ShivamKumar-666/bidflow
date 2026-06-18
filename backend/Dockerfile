# ── Stage 1: Build dependencies ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libcairo2-dev \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libevent-dev \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Runtime-only system deps (no gcc/libxml2-dev etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libevent-2.1-7 \
    libxml2 \
    libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -r -s /bin/false appuser

# Copy only installed packages from builder
COPY --from=builder /install /usr/local

COPY . .

RUN mkdir -p uploads /tmp/bidflow_uploads && \
    chown -R appuser:appuser /app

EXPOSE 5000

USER appuser

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]
