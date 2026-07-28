FROM node:20-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=5000
ENV SESSION_DATA_PATH=/app/session

EXPOSE 5000

CMD ["node", "src/index.js"]
