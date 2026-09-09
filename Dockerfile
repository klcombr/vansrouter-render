FROM node:26-bookworm-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (including next for VansRouter)
RUN npm install

# Copy app files
COPY . .

# VansRouter data directory
ENV VANSROUTER_DATA_DIR=/app/data
ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "server.js"]
