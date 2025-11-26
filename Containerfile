FROM node:22-alpine as builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /build
COPY package.json ./
COPY package-lock.json ./

RUN npm ci --omit=dev

COPY . .
RUN npm run build

# Stage to create the entrypoint script
FROM alpine:3.18 as entrypoint-builder

# Copy and set up the entrypoint script
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Final stage
FROM node:22-alpine

RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Copy built application from builder
COPY --from=builder /build/.output /app

# Copy the initialized database from the builder stage
COPY --from=builder /build/data /app/data

# Copy the entrypoint script from the builder
COPY --from=entrypoint-builder /entrypoint.sh /app/entrypoint.sh

# Create a non-root user and set permissions
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/data && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/app.db
ENV JWT_SECRET=${JWT_SECRET:-default-secret-key-change-me}

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/app/entrypoint.sh", "node", "/app/server/index.mjs"]
