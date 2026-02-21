# Use lightweight Node.js image
FROM node:18-alpine

# Install build tools for npm packages that need compilation
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy .env file too
COPY .env ./

# Copy the rest of the app
COPY . .

# Expose the port your app listens on
EXPOSE 3030

# Start the server
CMD ["./wait-for-it.sh", "db:3306", "--", "node", "server.js"]