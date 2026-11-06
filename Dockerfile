FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY dist ./dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DB_PATH=/app/data/bookings.sqlite
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
