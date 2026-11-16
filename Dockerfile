FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
FROM node:24-bookworm-slim
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node src/styles/tokens.css src/styles/status-page.css ./src/styles/
COPY --chown=node:node src/text-languages.json ./src/text-languages.json
COPY --chown=node:node src/resource-name.js ./src/resource-name.js
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node","server/main.js"]
