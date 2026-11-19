# API Vault frontend: Vite build served by Caddy, which also proxies /api to the backend over Railway's
# private network. The browser talks to one origin, so the HttpOnly refresh cookie and Google sign-in stay first-party.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Railway sets PORT; API_UPSTREAM must point at the backend, e.g. http://apivault-api.railway.internal:8080
ENV PORT=8080
EXPOSE 8080
