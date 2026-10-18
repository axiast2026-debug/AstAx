# AstAx «tools» image (phase 8): the whole repository built, to run once per
# release inside the VPC: migrations, the reference seed, the release gate.
#   docker build -f infra/docker/tools.Dockerfile -t astax-tools .
#   (ECS run-task) pnpm db:migrate | pnpm db:seed:reference | pnpm release:check
ARG NODE_IMAGE=node:24.15.0-bookworm-slim
FROM ${NODE_IMAGE}
WORKDIR /repo
RUN corepack enable pnpm && chown node:node /repo
USER node
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@astax/db...
CMD ["pnpm", "release:check"]
