FROM node:26-bookworm-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy app files
COPY . .

# VansRouter data directory
ENV VANSROUTER_DATA_DIR=/app/data
ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "server.js"]
