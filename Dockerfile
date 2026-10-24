FROM node:20-alpine AS base

# Güvenlik güncellemeleri ve tini init sistemi
RUN apk update && apk upgrade && apk add --no-cache tini sqlite

WORKDIR /app

# Bağımlılıkları kur
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Uygulama kaynaklarını kopyala
COPY server.js ./
COPY public ./public

# Kalıcı SQLite veritabanı klasörü ve non-root kullanıcı yetkisi
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
