# Build stage: needs devDependencies (typescript, @types/node) to compile.
FROM apify/actor-node:22 AS builder

COPY package*.json ./

RUN npm install --include=dev --audit=false --fund=false

COPY . ./

RUN npm run build

# Runtime stage: production dependencies only, plus the compiled output.
FROM apify/actor-node:22

COPY package*.json ./

# Optional dependencies are deliberately kept. @anthropic-ai/sdk is declared
# optional so a plain `npm install` stays lean, but the Actor has to be able to
# load it at runtime when a user enables enrichment. Omitting it here would make
# enrichWithAI silently impossible on the platform.
RUN npm --quiet set progress=false \
    && npm install --omit=dev --audit=false --fund=false \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" && node --version \
    && echo "NPM version:" && npm --version

COPY --from=builder /usr/src/app/dist ./dist

# Brings in .actor/ and seeds/companies.json, which main.js resolves at ../seeds.
COPY . ./

CMD ["node", "dist/main.js"]
