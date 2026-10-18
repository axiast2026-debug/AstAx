# AstAx web or admin image (phase 8), the standalone server of Next.js.
#   docker build -f infra/docker/next-app.Dockerfile --build-arg APP=web -t astax-web .
ARG NODE_IMAGE=node:24.15.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ARG APP
WORKDIR /repo
RUN corepack enable pnpm
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm turbo run build --filter=@astax/${APP}...

FROM ${NODE_IMAGE}
ARG APP
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
WORKDIR /app/apps/${APP}
CMD ["node", "server.js"]
