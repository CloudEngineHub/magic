<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SdkBase\Kernel\Component\Logger;

use Dtyq\SdkBase\Kernel\Component\Config\LogSanitizerConfig;
use Throwable;

/**
 * 结构化日志敏感信息脱敏器。
 */
class LogSanitizer
{
    /**
     * 初始化日志脱敏器。
     */
    public function __construct(private readonly LogSanitizerConfig $config)
    {
    }

    /**
     * 执行默认脱敏规则和调用方配置的自定义过滤回调。
     *
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function sanitize(string $level, string $message, array $context): array
    {
        if (! $this->config->isEnabled()) {
            return $context;
        }

        $context = $this->sanitizeArray($context);
        $filter = $this->config->getFilter();
        if ($filter === null) {
            return $context;
        }

        try {
            $filtered = $filter($level, $message, $context);
            return is_array($filtered) ? $filtered : $context;
        } catch (Throwable) {
            return $context;
        }
    }

    /**
     * 递归过滤日志上下文中的敏感字段、请求头、查询参数和 JSON 内容。
     *
     * @param array<mixed> $data
     * @return array<mixed>
     */
    private function sanitizeArray(array $data): array
    {
        foreach ($data as $key => $value) {
            $normalizedKey = is_string($key) ? strtolower($key) : '';
            if ($normalizedKey !== '' && $this->config->isSensitiveField($normalizedKey)) {
                $data[$key] = $this->config->maskValue($value);
                continue;
            }
            if (in_array($normalizedKey, ['header', 'headers'], true) && is_array($value)) {
                $data[$key] = $this->sanitizeHeaders($value);
                continue;
            }
            if ($normalizedKey === 'uri' && is_string($value)) {
                $data[$key] = $this->sanitizeUri($value);
                continue;
            }
            if (is_array($value)) {
                $data[$key] = $this->sanitizeArray($value);
                continue;
            }
            if (is_string($value) && in_array($normalizedKey, ['body', 'content'], true)) {
                $data[$key] = $this->sanitizeJsonString($value);
            }
        }

        return $data;
    }

    /**
     * 按不区分大小写的 Header 名称过滤敏感值。
     *
     * @param array<mixed> $headers
     * @return array<mixed>
     */
    private function sanitizeHeaders(array $headers): array
    {
        foreach ($headers as $name => $value) {
            if (is_string($name) && $this->config->isSensitiveHeader($name)) {
                $headers[$name] = $this->config->maskValue($value);
            }
        }

        return $headers;
    }

    /**
     * 过滤 URI 查询参数中的常见敏感字段。
     */
    private function sanitizeUri(string $uri): string
    {
        return preg_replace_callback(
            '/([?&])([^=&#]+)=([^&#]*)/',
            function (array $matches): string {
                $name = strtolower(rawurldecode($matches[2]));
                $value = $this->config->isSensitiveField($name)
                    ? rawurlencode((string) $this->config->maskValue(rawurldecode($matches[3])))
                    : $matches[3];
                return $matches[1] . $matches[2] . '=' . $value;
            },
            $uri
        ) ?? $uri;
    }

    /**
     * 在日志字段为 JSON 字符串时递归过滤其中的敏感信息。
     */
    private function sanitizeJsonString(string $content): string
    {
        $decoded = json_decode($content, true);
        if (! is_array($decoded)) {
            return $content;
        }
        $encoded = json_encode($this->sanitizeArray($decoded), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return is_string($encoded) ? $encoded : $content;
    }
}
