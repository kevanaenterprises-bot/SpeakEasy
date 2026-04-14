FROM node:22-alpine

WORKDIR /app

# Build from root (matches railway.toml)
COPY package*.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

# Copy all source files
COPY client/ ./client/
COPY attached_assets/ ./attached_assets/
COPY public/ ./public/
COPY vite.config.ts ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY index.html ./
RUN npm run build --legacy-peer-deps

# Start the server
CMD ["npm", "run", "start"]
