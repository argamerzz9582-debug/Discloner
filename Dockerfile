# syntax=docker/dockerfile:1.7
# =============================================================================
# DISCLONER STUDIO — multi-stage production image
#
#   docker build -t discloner:3.0.0 .
#   docker run --rm -p 127.0.0.1:3000:3000 discloner:3.0.0
#
# The image runs as an unprivileged user, carries no build tooling, and exposes
# a health endpoint that Docker can probe.
# =============================================================================

# ---------------------------------------------------------------- deps stage
FROM node:22-alpine AS deps

WORKDIR /app

# Install only what production needs. `npm ci` is reproducible from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force


# ------------------------------------------------------------- runtime stage
FROM node:22-alpine AS runtime

# tini reaps zombie processes and forwards signals so SIGTERM reaches Node.
RUN apk add --no-cache tini \
    && addgroup -g 10001 -S discloner \
    && adduser -u 10001 -S discloner -G discloner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    LOG_FORMAT=json \
    PERSIST_JOBS=true \
    JOB_STATE_DIR=/data/state \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./
COPY --chown=root:root server.js ./
COPY --chown=root:root services ./services
COPY --chown=root:root utils ./utils
COPY --chown=root:root scripts ./scripts
COPY --chown=root:root public ./public
COPY --chown=root:root metadata.json ./

# Job checkpoints live on a volume so a container restart can resume a clone.
RUN mkdir -p /data/state && chown -R discloner:discloner /data

USER discloner:discloner

EXPOSE 3000

# Fail the health check if the API cannot answer within 3 seconds.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

LABEL org.opencontainers.image.title="Discloner Studio" \
      org.opencontainers.image.description="Precision Discord server migration, continuous mirroring and resumable jobs" \
      org.opencontainers.image.source="https://github.com/argamerzz9582-debug/Discloner" \
      org.opencontainers.image.licenses="MIT"
