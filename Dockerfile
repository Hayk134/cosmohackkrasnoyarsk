# Dockerfile for Kosmo·MRV Backend Service
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for GDAL/rasterio and C libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    gdal-bin \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application and dataset
COPY backend/ ./backend/
COPY data/ ./data/

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Launch uvicorn
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
