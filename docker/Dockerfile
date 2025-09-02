FROM node:20-slim

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production

# Install Playwright and its browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/app/browsers
RUN mkdir -p /app/browsers && \
    npx playwright install chromium && \
    npx playwright install-deps chromium

# Copy application code
COPY . .

# Create directories
RUN mkdir -p logs exports

# Create startup script
RUN echo '#!/bin/sh\n\
if [ ! -d "/app/browsers/chromium-*" ]; then\n\
  echo "Installing Playwright browsers..."\n\
  npx playwright install chromium\n\
fi\n\
exec "$@"' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Run as non-root user
RUN groupadd -r crawler && useradd -r -g crawler crawler
RUN chown -R crawler:crawler /app
USER crawler

# Use entrypoint to ensure browsers are installed
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command - use Supabase REST API
CMD ["npm", "run", "crawl"]