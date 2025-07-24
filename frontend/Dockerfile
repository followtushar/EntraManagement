# Use Node.js 18 LTS Alpine image
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache curl && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

# Build stage
FROM base AS build

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables
ARG REACT_APP_AZURE_CLIENT_ID
ARG REACT_APP_AZURE_TENANT_ID
ARG REACT_APP_REDIRECT_URI
ARG REACT_APP_API_URL

# Set environment variables
ENV REACT_APP_AZURE_CLIENT_ID=$REACT_APP_AZURE_CLIENT_ID
ENV REACT_APP_AZURE_TENANT_ID=$REACT_APP_AZURE_TENANT_ID
ENV REACT_APP_REDIRECT_URI=$REACT_APP_REDIRECT_URI
ENV REACT_APP_API_URL=$REACT_APP_API_URL

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application
COPY --from=build /app/build /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S nginx && \
    adduser -S nginx -u 1001 -G nginx

# Change ownership of nginx directories
RUN chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to non-root user
USER nginx

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000 || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]