FROM node:22-slim

WORKDIR /app

# Build tools ensure better-sqlite3 compiles if a prebuilt binary isn't found
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source
COPY . .

# Persistent data lives here (mount a Railway Volume at /data and set DATA_DIR=/data)
ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV PORT=8080
RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "server.js"]