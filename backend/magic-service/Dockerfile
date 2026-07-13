ARG GOLANG_VERSION=1.26
ARG BASE_IMAGE=ghcr.io/dtyq/php-dockerfile:8.4-alpine-3.23-swow-ci-jsonpath-parle-xlswriter
FROM --platform=$BUILDPLATFORM golang:${GOLANG_VERSION}-alpine AS go-builder

ARG TARGETARCH
ARG APK_MIRROR=mirrors.aliyun.com
ARG GOPROXY=https://goproxy.cn,direct

ENV GOPROXY=${GOPROXY}

WORKDIR /src/go-engine

RUN --mount=type=cache,id=alpine-apk-go-${GOLANG_VERSION}-${TARGETARCH},target=/var/cache/apk \
    sed -i.bak "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories && \
    apk update && \
    apk add \
        build-base \
        git \
    && \
    mv /etc/apk/repositories.bak /etc/apk/repositories

COPY go-engine/go.mod go-engine/go.sum ./
RUN --mount=type=cache,id=go-mod-${GOLANG_VERSION}-alpine-${TARGETARCH},target=/go/pkg/mod \
    --mount=type=cache,id=go-build-${GOLANG_VERSION}-alpine-${TARGETARCH},target=/root/.cache/go-build \
    go mod download

COPY go-engine/ ./
RUN --mount=type=cache,id=go-mod-${GOLANG_VERSION}-alpine-${TARGETARCH},target=/go/pkg/mod \
    --mount=type=cache,id=go-build-${GOLANG_VERSION}-alpine-${TARGETARCH},target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} \
    go build -trimpath -ldflags="-s -w" -o /tmp/magic-go-engine .

FROM ${BASE_IMAGE} AS base

ARG TARGETARCH

ARG TZ=Asia/Shanghai

ENV TZ=${TZ} \
    SCAN_CACHEABLE=(true) \
    USE_ZEND_ALLOC=0 \
    COMPOSER_FUND=0 \
    PHP_MEMORY_LIMIT=-1 \
    COMPOSER_MEMORY_LIMIT=-1 \
    PHP_INI_MEMORY_LIMIT=-1

# 设置 PHP 配置
RUN mkdir -p /etc/php/conf.d && \
    echo "memory_limit = -1" > /etc/php/conf.d/memory-limit.ini && \
    echo "max_execution_time = 0" > /etc/php/conf.d/max-execution-time.ini

# 安装运行时依赖
ARG APK_MIRROR=mirrors.aliyun.com
RUN --mount=type=cache,id=alpine-apk-3.23-${TARGETARCH},target=/var/cache/apk \
    # 配置 apk 镜像
    sed -i.bak "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories && \
    apk update && \
    apk add \
        ffmpeg \
        icu-data-full \
        tzdata \
        tini \
    && \
    # 恢复 apk 源配置
    mv /etc/apk/repositories.bak /etc/apk/repositories

FROM base AS php_deps

ARG TARGETARCH

WORKDIR /opt/www

COPY composer.json composer.lock ./

ARG COMPOSER_MIRROR=https://mirrors.aliyun.com/composer/
RUN --mount=type=cache,id=composer-cache-v1-${TARGETARCH},target=/root/.composer/cache \
    --mount=type=cache,id=composer-cache-v2-${TARGETARCH},target=/root/.cache/composer \
    # 配置 composer 镜像
    { \
        [ -n "${COMPOSER_MIRROR}" ] && \
        composer config -g repo.packagist composer "${COMPOSER_MIRROR}" || \
        composer config -g --unset repos.packagist ; \
    } && \
    composer install --no-dev --no-interaction --prefer-dist --no-progress --no-scripts --no-autoloader && \
    # 清理 composer 镜像配置
    { \
        [ -f /root/.config/composer/config.json ] && \
        rm /root/.config/composer/config.json || \
        true ; \
    }

FROM base

WORKDIR /opt/www

COPY --from=php_deps /opt/www/vendor /opt/www/vendor
COPY . /opt/www
COPY --from=go-builder /tmp/magic-go-engine /opt/www/bin/magic-go-engine

# 生成生产环境自动加载文件
RUN composer dump-autoload --optimize --no-dev

# 可选的：标记expose端口
EXPOSE 81
EXPOSE 9501
EXPOSE 9502

ENTRYPOINT ["sh", "/opt/www/start.sh"]
