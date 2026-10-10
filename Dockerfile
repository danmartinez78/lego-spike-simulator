FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY server ./server
COPY presets ./presets
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENV PORT=8080 \
    DIST_DIR=/app/dist \
    SEED_DIR=/app/presets \
    LIBRARY_DIR=/data/library \
    LDRAW_DIR=/data/ldraw \
    LDRAW_URL=https://library.ldraw.org/library/updates/complete.zip
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
