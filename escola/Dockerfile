# Caderneta Escolar — imagem de produção (sem dependências externas)
FROM node:22-alpine
# PUBLIC_URL é obrigatória (ex.: https://escola.exemplo.com.br): o TLS fica no proxy (Caddy, nginx…)
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    TRUST_PROXY=1
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
