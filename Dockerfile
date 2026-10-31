# Build produces public client assets. Never pass server secrets as build args.
FROM oven/bun:1.4.4 AS build
WORKDIR /workspace
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_ENABLE_GOOGLE_OAUTH=false
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
    VITE_ENABLE_GOOGLE_OAUTH=${VITE_ENABLE_GOOGLE_OAUTH}
RUN bun run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 NITRO_PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /workspace/.output/ ./.output/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node",".output/server/index.mjs"]
