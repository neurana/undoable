FROM node:22-bookworm-slim AS builder

RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/daemon/package.json ./packages/daemon/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/llm-sdk/package.json ./packages/llm-sdk/package.json
COPY packages/sandbox/package.json ./packages/sandbox/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build

# Production stage
FROM node:22-bookworm-slim

RUN corepack enable

WORKDIR /app

# Copy package files for production install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/daemon/package.json ./packages/daemon/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/llm-sdk/package.json ./packages/llm-sdk/package.json
COPY packages/sandbox/package.json ./packages/sandbox/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/daemon/dist ./packages/daemon/dist
COPY --from=builder /app/packages/cli/dist ./packages/cli/dist
COPY --from=builder /app/packages/llm-sdk/dist ./packages/llm-sdk/dist
COPY --from=builder /app/packages/sandbox/dist ./packages/sandbox/dist

ENV NODE_ENV=production

# Create non-root user
RUN chown -R node:node /app
USER node

EXPOSE 7433

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:7433/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/packages/daemon/src/index.js"]
