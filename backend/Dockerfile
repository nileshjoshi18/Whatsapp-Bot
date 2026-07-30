FROM node:20-bookworm

WORKDIR /app

# Original deps (needed for node-canvas / generateTasksCard image generation)
# + Chromium and the runtime libraries whatsapp-web.js/puppeteer-core need to launch it headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=5000
ENV SESSION_DATA_PATH=/app/session

# Tell Puppeteer to use the apt-installed Chromium instead of trying to download its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 5000

CMD ["node", "src/index.js"]