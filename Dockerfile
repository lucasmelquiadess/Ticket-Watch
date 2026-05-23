FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
ARG INSTALL_PLAYWRIGHT=false

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
RUN if [ "$INSTALL_PLAYWRIGHT" = "true" ]; then npx playwright install --with-deps chromium; fi

COPY --from=build /app/dist ./dist
COPY --from=build /app/data/.gitkeep ./data/.gitkeep

EXPOSE 4000
VOLUME ["/app/data"]

CMD ["node", "dist/server/index.js"]
