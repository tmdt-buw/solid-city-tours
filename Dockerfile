# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=npm_token,required=false sh -c 'TOKEN="$(cat /run/secrets/npm_token 2>/dev/null || true)"; if [ -n "$TOKEN" ]; then printf "@hoelk-f:registry=https://npm.pkg.github.com/\n//npm.pkg.github.com/:_authToken=%s\n" "$TOKEN" > /tmp/npmrc; NPM_CONFIG_USERCONFIG=/tmp/npmrc npm ci; rm -f /tmp/npmrc; else npm ci; fi'
COPY . .
RUN npm run build:app

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html/solid-tours
EXPOSE 3006
CMD ["nginx", "-g", "daemon off;"]
