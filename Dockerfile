# Use official Node.js runtime
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for Sharp
RUN apk add --no-cache \
    libc6-compat \
    vips-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directories for data
RUN mkdir -p captured_images saved_images

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node health-check.js

# Start the application
CMD ["npm", "start"]
