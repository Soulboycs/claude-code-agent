FROM oven/bun:1-alpine

WORKDIR /app

# Copy dependency specifications
COPY package.json ./

# Install dependencies with bun
RUN bun install --production

# Copy server and agent source code
COPY src ./src
COPY tsconfig*.json ./

# Expose server HTTP and WebSocket port
EXPOSE 3456

# Volume for SQLite persistence and user configs
VOLUME ["/root/.claude-agent"]

ENV SERVER_PORT=3456
ENV SERVER_HOST=0.0.0.0

CMD ["bun", "run", "src/server/index.ts"]
