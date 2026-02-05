# Build stage - Node.js 20 slim
FROM node:20-slim AS build

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY server.js ./
COPY public/ ./public/

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy from build stage
COPY --from=build /app ./

# Expose MCP server port
EXPOSE 8787

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8787

# Run the server
CMD ["node", "server.js"]
