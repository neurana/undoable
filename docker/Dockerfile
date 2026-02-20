FROM node:22-bookworm-slim

# Install system dependencies:
# - Chromium + rendering libs for Playwright browser automation
# - Common dev tools the daemon's exec-tool allowlist expects (git, python3, curl, jq, etc.)
# - Build tools for native Node.js addons
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium fonts-liberation libnss3 libatk-bridge2.0-0 libdrm2 \
      libxkbcommon0 libgbm1 \
      git curl wget jq \
      python3 python3-pip \
      bash procps openssh-client \
      zip unzip xz-utils \
      make g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use system Chromium instead of downloading its own
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

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
