FROM apify/actor-node:22

COPY package*.json ./
RUN npm --quiet set progress=false \
 && npm install --omit=dev --omit=optional --no-audit --no-fund \
 && echo "Installed:" && npm ls --omit=dev --all || true

COPY . ./
RUN npm install --no-audit --no-fund typescript@^5.6.3 \
 && npx tsc \
 && npm prune --omit=dev --omit=optional

CMD ["node", "dist/main.js"]
