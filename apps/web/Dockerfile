FROM node:22-slim AS dependencies
WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/blockchain/tron/package.json packages/blockchain/tron/package.json
COPY packages/payment/paystack/package.json packages/payment/paystack/package.json
COPY packages/payment/nowpayments/package.json packages/payment/nowpayments/package.json
RUN npm ci

FROM node:22-slim AS base
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/blockchain/tron/package.json packages/blockchain/tron/package.json
COPY packages/payment/paystack/package.json packages/payment/paystack/package.json
COPY packages/payment/nowpayments/package.json packages/payment/nowpayments/package.json
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/web/node_modules ./apps/web/node_modules

FROM base AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "@cliqero/web", "--", "--hostname", "0.0.0.0"]

FROM base AS build
ARG APP_URL
ENV APP_URL=${APP_URL}
RUN test -n "$APP_URL"
COPY . .
RUN npm run build --workspace @cliqero/web

FROM base AS worker
COPY . .
CMD ["npm", "run", "worker:outbox", "--workspace", "@cliqero/web"]

FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
# Web-owned informational MDX is repository-owned runtime content. Bake it into
# the production image; development bind-mounts the same directory for live edits.
COPY --from=build /workspace/apps/web/content ./apps/web/content
# Blog SQLite migrations are runtime files used to upgrade the persistent blog database.
COPY --from=build /workspace/apps/web/src/infrastructure/blog/migrations ./apps/web/src/infrastructure/blog/migrations
# Reference data is loaded at runtime by the application and is not guaranteed to
# be included in Next.js standalone output, so copy the app-owned data explicitly.
COPY --from=build /workspace/apps/web/data ./apps/web/data
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
