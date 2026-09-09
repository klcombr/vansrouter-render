# VansRouter for Render - Build from source
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install git for cloning
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Clone VansRouter repo
RUN git clone --depth 1 https://github.com/Vanszs/VansRouter.git . && \
    rm -rf .git

# Install dependencies (pnpm lockfile, but npm works too)
RUN npm install --include=optional --no-audit --no-fund

# Build Next.js standalone
RUN npm run build

# Production stage
FROM node:22-bookworm-slim

WORKDIR /app

# Copy the entire built app (includes .next/standalone, public, src, config files)
COPY --from=builder /app/ ./

# Ensure data directory for VansRouter
RUN mkdir -p /app/data

# Environment
ENV PORT=10000
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV VANSROUTER_DATA_DIR=/app/data

EXPOSE 10000

# VansRouter default port is 20128, override with PORT=10000 for Render
CMD ["node", "custom-server.js"]
