FROM node:18-alpine AS base

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY server.js ./
COPY data/      ./data/
COPY middleware/ ./middleware/
COPY routes/    ./routes/
COPY services/  ./services/
COPY public/    ./public/

# Run as non-root user
RUN addgroup -S ecosage && adduser -S ecosage -G ecosage
USER ecosage

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "server.js"]
