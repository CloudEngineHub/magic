<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Kernel\DTO;

use InvalidArgumentException;

/** 平台参考倍率配置，只影响展示，不参与实际结算。 */
final readonly class ModelBillingMultiplierSettings
{
    private const DEFAULT_USD_TO_CNY_RATE = '7';

    /** 保留金额字符串，避免配置读写时丢失十进制精度。 */
    private function __construct(public bool $enabled, public ?string $basePriceCny, public ?string $usdToCnyRate)
    {
    }

    /** 历史配置默认关闭，未配置展示汇率时统一返回默认值，已有配置仍按正数校验。 */
    public static function fromArray(array $data): self
    {
        $enabled = (bool) ($data['enabled'] ?? false);
        $base = self::positiveDecimal($data['base_price_cny'] ?? null);
        $rate = self::positiveDecimal($data['usd_to_cny_rate'] ?? null) ?? self::DEFAULT_USD_TO_CNY_RATE;
        if ($enabled && ($base === null || $rate === null)) {
            throw new InvalidArgumentException('Enabled model multiplier requires a positive base price and USD/CNY rate');
        }
        return new self($enabled, $base, $rate);
    }

    /** 返回两个管理端共用的完整配置，未填写基准价保持空值。 */
    public function toArray(): array
    {
        return ['enabled' => $this->enabled, 'base_price_cny' => $this->basePriceCny, 'usd_to_cny_rate' => $this->usdToCnyRate];
    }

    /** 限制配置精度和长度，拒绝负数、零、非有限数及科学计数法。 */
    private static function positiveDecimal(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $decimal = is_scalar($value) ? (string) $value : '';
        if (! preg_match('/^\d{1,12}(?:\.\d{1,12})?$/D', $decimal) || bccomp($decimal, '0', 12) <= 0) {
            throw new InvalidArgumentException('Model multiplier prices must be positive decimals with at most 12 decimal places');
        }
        return $decimal;
    }
}
