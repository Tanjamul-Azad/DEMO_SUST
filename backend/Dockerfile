# QueueStorm API — CPU-only, no GPU, no secrets.
FROM node:20-slim

# better-sqlite3 needs build tools only if no prebuilt binary is available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=8787
ENV LLM_ENABLED=false
EXPOSE 8787

# Migration runs automatically on boot (src/db.js).
CMD ["node", "src/server.js"]
