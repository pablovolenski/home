FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
ENV HOST=0.0.0.0 PORT=8787 DB_PATH=/data/quiz.db TRUST_PROXY=1
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
