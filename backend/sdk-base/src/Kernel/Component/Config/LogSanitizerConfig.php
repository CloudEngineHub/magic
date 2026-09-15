<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SdkBase\Kernel\Component\Config;

use Closure;

/**
 * 日志脱敏配置值对象。
 */
class LogSanitizerConfig
{
    private const MASK_MODE_FULL = 'full';

    private const MASK_MODE_PARTIAL = 'partial';

    private const DEFAULT_MASK = '***';

    private const DEFAULT_SENSITIVE_HEADERS = [
        'authorization',
        'proxy-authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
        'api-key',
        'x-access-token',
        'access-token',
        'token',
    ];

    private const DEFAULT_SENSITIVE_FIELDS = [
        'password',
        'passwd',
        'pwd',
        'secret',
        'client_secret',
        'access_token',
        'refresh_token',
        'token',
        'api_key',
        'apikey',
        'ak',
        'sk',
    ];

    private bool $enabled;

    private string $mask;

    private string $maskMode;

    private int $visiblePrefixLength;

    private int $visibleSuffixLength;

    private array $sensitiveHeaders;

    private array $sensitiveFields;

    private ?Closure $filter;

    /**
     * 初始化默认日志脱敏规则，并合并调用方传入的扩展配置。
     *
     * @param array<string, mixed> $config
     */
    public function __construct(array $config = [])
    {
        $this->enabled = (bool) ($config['enabled'] ?? true);
        $this->mask = is_string($config['mask'] ?? null) ? $config['mask'] : self::DEFAULT_MASK;
        $maskMode = is_string($config['mask_mode'] ?? null) ? $config['mask_mode'] : self::MASK_MODE_PARTIAL;
        $this->maskMode = in_array($maskMode, [self::MASK_MODE_FULL, self::MASK_MODE_PARTIAL], true)
            ? $maskMode
            : self::MASK_MODE_FULL;
        $this->visiblePrefixLength = max(0, (int) ($config['visible_prefix_length'] ?? 3));
        $this->visibleSuffixLength = max(0, (int) ($config['visible_suffix_length'] ?? 3));
        $this->sensitiveHeaders = $this->normalizeNames(array_merge(
            self::DEFAULT_SENSITIVE_HEADERS,
            is_array($config['sensitive_headers'] ?? null) ? $config['sensitive_headers'] : []
        ));
        $this->sensitiveFields = $this->normalizeNames(array_merge(
            self::DEFAULT_SENSITIVE_FIELDS,
            is_array($config['sensitive_fields'] ?? null) ? $config['sensitive_fields'] : []
        ));
        $this->filter = is_callable($config['filter'] ?? null) ? ($config['filter'])(...) : null;
    }

    /**
     * 判断日志脱敏是否启用。
     */
    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    /**
     * 获取敏感信息替换文本。
     */
    public function getMask(): string
    {
        return $this->mask;
    }

    /**
     * 按配置的完整或部分模式生成脱敏后的字段值。
     */
    public function maskValue(mixed $value): mixed
    {
        if ($this->maskMode !== self::MASK_MODE_PARTIAL) {
            return $this->mask;
        }
        if (is_array($value)) {
            return array_map(fn (mixed $item): mixed => $this->maskValue($item), $value);
        }
        if (! is_string($value)) {
            return $this->mask;
        }

        $visibleLength = $this->visiblePrefixLength + $this->visibleSuffixLength;
        if ($value === '' || strlen($value) <= $visibleLength) {
            return $this->mask;
        }

        $prefix = $this->visiblePrefixLength > 0 ? substr($value, 0, $this->visiblePrefixLength) : '';
        $suffix = $this->visibleSuffixLength > 0 ? substr($value, -$this->visibleSuffixLength) : '';
        return $prefix . $this->mask . $suffix;
    }

    /**
     * 判断指定 Header 是否属于敏感 Header。
     */
    public function isSensitiveHeader(string $name): bool
    {
        return in_array(strtolower($name), $this->sensitiveHeaders, true);
    }

    /**
     * 判断指定字段是否属于敏感字段。
     */
    public function isSensitiveField(string $name): bool
    {
        return in_array(strtolower($name), $this->sensitiveFields, true);
    }

    /**
     * 获取调用方配置的日志过滤回调。
     */
    public function getFilter(): ?Closure
    {
        return $this->filter;
    }

    /**
     * 将配置名称规范化为去重的小写字符串列表。
     *
     * @param array<mixed> $names
     * @return string[]
     */
    private function normalizeNames(array $names): array
    {
        $normalized = [];
        foreach ($names as $name) {
            if (is_string($name) && $name !== '') {
                $normalized[] = strtolower($name);
            }
        }

        return array_values(array_unique($normalized));
    }
}
