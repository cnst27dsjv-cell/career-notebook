FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN DATABASE_URL=postgresql://build:build@localhost/build BETTER_AUTH_SECRET=build-only-not-a-runtime-secret-000000000000 BETTER_AUTH_URL=http://localhost:3000 npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx","next","start","--hostname","0.0.0.0","--port","3000"]
