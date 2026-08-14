# The keeper is a long-running worker, not a web app. The HTTP port exists only
# so fly can ask whether the table is still moving.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY game ./game
COPY keeper ./keeper

# Never run the keeper as root, and never let it write to the image.
USER node
EXPOSE 8080
CMD ["node", "keeper/server.js"]
