# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:20.18-alpine AS build

WORKDIR /app

# electron and electron-builder are devDependencies used only by the desktop
# build; skipping them here avoids a ~150MB binary download.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# react-scripts treats warnings as errors when CI is set, and Coolify sets it.
ENV CI=false

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Optional override for the version shown on the connect screen. Declared after
# npm ci so changing it does not invalidate the dependency layer.
ARG APP_VERSION=""

COPY . .

# `npm run build` also invokes electron-builder, which cannot run in this image.
# REACT_APP_VERSION is only set when APP_VERSION was supplied; leaving it unset
# lets .env resolve $npm_package_version, which CI bumps on every build.
RUN if [ -n "$APP_VERSION" ]; then \
      REACT_APP_VERSION="$APP_VERSION" npm run react-build; \
    else \
      npm run react-build; \
    fi

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
