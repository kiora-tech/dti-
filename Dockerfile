FROM node:22.14-alpine3.21

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src/ src/
COPY public/ public/
COPY schema/ schema/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

USER node

CMD ["node", "src/server.js"]
