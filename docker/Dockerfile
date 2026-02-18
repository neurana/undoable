FROM node:22-bookworm-slim

RUN corepack enable

WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/daemon/package.json ./packages/daemon/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/llm-sdk/package.json ./packages/llm-sdk/package.json
COPY packages/sandbox/package.json ./packages/sandbox/package.json
COPY ui/package.json ./ui/package.json

# Install all dependencies so tsx can run source entrypoints reliably.
RUN pnpm install --frozen-lockfile

# Copy source tree after dependencies.
COPY . .

ENV NODE_ENV=production

RUN chown -R node:node /app
USER node

EXPOSE 7433

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:7433/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run daemon from TypeScript source using tsx loader.
CMD ["node", "--import", "tsx", "packages/daemon/src/index.ts"]
