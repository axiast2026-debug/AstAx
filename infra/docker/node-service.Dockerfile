# AstAx API or worker image (phase 8). Build from the repository root:
#   docker build -f infra/docker/node-service.Dockerfile --build-arg APP=api -t astax-api .
# The .env file never enters the image (.dockerignore): the configuration comes
# from the task definition and AWS Secrets Manager (rule 12).
ARG NODE_IMAGE=node:24.15.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ARG APP
WORKDIR /repo
RUN corepack enable pnpm
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm turbo run build --filter=@astax/${APP}... \
 && pnpm deploy --filter=@astax/${APP} --prod --legacy /out

FROM ${NODE_IMAGE}
ARG APP
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out .
# The texts of the notifications and the other reference files (seed/), found
# from the «repository root» that pnpm-workspace.yaml marks.
COPY --from=build --chown=node:node /repo/seed ./seed
COPY --from=build --chown=node:node /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
USER node
EXPOSE 4000 4100
CMD ["node", "--enable-source-maps", "dist/main.js"]
