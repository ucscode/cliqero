FROM node:22-alpine AS base
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM base AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "@cliqero/web", "--", "--hostname", "0.0.0.0"]

FROM base AS build
COPY . .
RUN npm run build --workspace @cliqero/web

FROM base AS worker
COPY . .
CMD ["npm", "run", "worker:outbox", "--workspace", "@cliqero/web"]

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
