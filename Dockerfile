FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY server.ts ./
COPY constants.ts ./
COPY data/       ./data/
COPY middleware/ ./middleware/
COPY routes/     ./routes/
COPY services/   ./services/
COPY utils/      ./utils/
COPY types/      ./types/

RUN npm run build

# ── Production image ──────────────────────────────────────
FROM node:18-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY public/ ./public/

RUN addgroup -S ecosage && adduser -S ecosage -G ecosage
USER ecosage

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "dist/server.js"]
