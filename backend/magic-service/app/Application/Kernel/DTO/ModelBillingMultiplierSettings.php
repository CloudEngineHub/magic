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

    private const REFERENCE_AMOUNT_SCALE = 15;

    /** 保留金额字符串，避免配置读写时丢失十进制精度。 */
    private function __construct(
        public bool $enabled,
        public ?string $basePriceCny,
        public string $usdToCnyRate,
        public ?string $inputPriceCny,
        public ?string $outputPriceCny,
    ) {
    }

    /** 历史配置默认关闭，未配置展示汇率时统一返回默认值，已有配置仍按正数校验。 */
    public static function fromArray(array $data): self
    {
        $enabled = (bool) ($data['enabled'] ?? false);
        $input = self::decimal($data['input_price_cny'] ?? null, true);
        $output = self::decimal($data['output_price_cny'] ?? null, true);
        if ($input !== null || $output !== null) {
            if ($input === null || $output === null || (bccomp($input, '0', 12) === 0 && bccomp($output, '0', 12) === 0)) {
                throw new InvalidArgumentException('Both reference token prices are required and must not both be zero');
            }
            // 新单价优先，忽略前端回传的旧参考金额；输出保留到 15 位以覆盖最小合法单价。
            $base = self::referenceAmount($input, $output);
        } else {
            // 历史金额无法反推两项单价，继续保留原有金额与精度约束。
            $base = self::decimal($data['base_price_cny'] ?? null);
        }
        $rate = self::decimal($data['usd_to_cny_rate'] ?? null) ?? self::DEFAULT_USD_TO_CNY_RATE;
        if ($enabled && $base === null) {
            throw new InvalidArgumentException('Enabled model multiplier requires a positive base price and USD/CNY rate');
        }
        return new self($enabled, $base, $rate, $input, $output);
    }

    /** 部分更新保留已有单价；旧客户端明确修改基准金额时恢复金额配置模式。 */
    public function withOverrides(array $overrides): self
    {
        $data = array_replace($this->toArray(), $overrides);
        if (! array_key_exists('input_price_cny', $overrides) && ! array_key_exists('output_price_cny', $overrides) && array_key_exists('base_price_cny', $overrides)) {
            $base = self::decimal($overrides['base_price_cny'], false, self::REFERENCE_AMOUNT_SCALE);
            $changed = $base === null || $this->basePriceCny === null || bccomp($base, $this->basePriceCny, self::REFERENCE_AMOUNT_SCALE) !== 0;
            if ($changed) {
                $data['input_price_cny'] = null;
                $data['output_price_cny'] = null;
            }
        }
        return self::fromArray($data);
    }

    /** 返回两个管理端共用的完整配置，未填写基准价保持空值。 */
    public function toArray(): array
    {
        return [
            'enabled' => $this->enabled,
            'base_price_cny' => $this->basePriceCny,
            'usd_to_cny_rate' => $this->usdToCnyRate,
            'input_price_cny' => $this->inputPriceCny,
            'output_price_cny' => $this->outputPriceCny,
        ];
    }

    /** 区分单价的零值与缺失值；计算金额额外允许三位小数精度。 */
    private static function decimal(mixed $value, bool $allowZero = false, int $scale = 12): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $decimal = is_string($value) || is_int($value) || is_float($value) ? (string) $value : '';
        if (! preg_match('/^\d{1,12}(?:\.\d{1,' . $scale . '})?$/D', $decimal) || (! $allowZero && bccomp($decimal, '0', $scale) <= 0)) {
            throw new InvalidArgumentException('Model multiplier amounts must be valid decimals within the allowed precision');
        }
        return $decimal;
    }

    /** 基准单价单位为人民币每百万 token，固定参考输入一万、输出一千 token。 */
    private static function referenceAmount(string $input, string $output): string
    {
        $amount = bcadd(bcmul($input, '0.01', self::REFERENCE_AMOUNT_SCALE), bcmul($output, '0.001', self::REFERENCE_AMOUNT_SCALE), self::REFERENCE_AMOUNT_SCALE);
        return rtrim(rtrim($amount, '0'), '.');
    }
}
