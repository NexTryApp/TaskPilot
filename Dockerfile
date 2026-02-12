# TaskPilot — main web server container
FROM node:22-slim AS base

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Install tsx globally for running TypeScript directly
RUN npm install -g tsx

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/
COPY example/ ./example/

# Create data directory for persistent storage
RUN mkdir -p /app/data

EXPOSE 4242

ENV NODE_ENV=production

CMD ["tsx", "web/server.ts"]
