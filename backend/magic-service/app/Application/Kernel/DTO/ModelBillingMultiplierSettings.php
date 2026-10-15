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

    private const REFERENCE_AMOUNT_SCALE = 27;

    /** 旧字段只回显真实人民币单价，不把美元原文误标成人民币。 */
    public ?string $inputPriceCny;

    public ?string $outputPriceCny;

    /** 单价原文和币种一起保存，参考金额始终归一到人民币。 */
    private function __construct(
        public bool $enabled,
        public ?string $basePriceCny,
        public string $usdToCnyRate,
        public string $currency,
        public ?string $inputPrice,
        public ?string $outputPrice,
    ) {
        $this->inputPriceCny = $currency === 'CNY' ? $inputPrice : null;
        $this->outputPriceCny = $currency === 'CNY' ? $outputPrice : null;
    }

    /** 历史配置默认人民币，旧单价字段在配置层迁移，界面无需填补默认值。 */
    public static function fromArray(array $data): self
    {
        $enabled = (bool) ($data['enabled'] ?? false);
        $currency = $data['currency'] ?? 'CNY';
        if (! in_array($currency, ['CNY', 'USD'], true)) {
            throw new InvalidArgumentException('Reference price currency must be CNY or USD');
        }
        $rate = self::decimal($data['usd_to_cny_rate'] ?? null) ?? self::DEFAULT_USD_TO_CNY_RATE;
        $input = self::decimal(array_key_exists('input_price', $data) ? $data['input_price'] : ($data['input_price_cny'] ?? null), true);
        $output = self::decimal(array_key_exists('output_price', $data) ? $data['output_price'] : ($data['output_price_cny'] ?? null), true);
        if ($input !== null || $output !== null) {
            if ($input === null || $output === null || (bccomp($input, '0', 12) === 0 && bccomp($output, '0', 12) === 0)) {
                throw new InvalidArgumentException('Both reference token prices are required and must not both be zero');
            }
            // 始终按源单价重算，不能把前次换算后的金额再次乘汇率。
            $amount = bcadd(bcmul($input, '0.01', 15), bcmul($output, '0.001', 15), 15);
            $base = $currency === 'USD' ? bcmul($amount, $rate, self::REFERENCE_AMOUNT_SCALE) : $amount;
            $base = rtrim(rtrim($base, '0'), '.');
        } else {
            // 仅存参考金额的历史数据继续按人民币读取，不反推单价或重复换汇。
            $base = self::decimal($data['base_price_cny'] ?? null, false, self::REFERENCE_AMOUNT_SCALE, 24);
        }
        if ($enabled && $base === null) {
            throw new InvalidArgumentException('Enabled model multiplier requires a positive reference amount');
        }
        return new self($enabled, $base, $rate, $currency, $input, $output);
    }

    /** 合并部分更新，兼容旧客户端修改人民币单价或直接修改参考金额。 */
    public function withOverrides(array $overrides): self
    {
        $data = array_replace($this->toArray(), $overrides);
        $hasPrices = array_key_exists('input_price', $overrides) || array_key_exists('output_price', $overrides)
            || array_key_exists('input_price_cny', $overrides) || array_key_exists('output_price_cny', $overrides);
        $pricesChanged = (array_key_exists('input_price', $overrides) && $overrides['input_price'] !== $this->inputPrice)
            || (array_key_exists('output_price', $overrides) && $overrides['output_price'] !== $this->outputPrice);
        $currencyChanged = array_key_exists('currency', $overrides) && $overrides['currency'] !== $this->currency;
        $legacyChanged = (array_key_exists('input_price_cny', $overrides) && $overrides['input_price_cny'] !== $this->inputPriceCny)
            || (array_key_exists('output_price_cny', $overrides) && $overrides['output_price_cny'] !== $this->outputPriceCny);
        if ($legacyChanged && ! $pricesChanged && ! $currencyChanged) {
            // 旧界面可能回传不认识的新字段；以实际改动的旧字段识别人民币配置更新。
            $data['currency'] = 'CNY';
            $data['input_price'] = $overrides['input_price_cny'] ?? $this->inputPriceCny;
            $data['output_price'] = $overrides['output_price_cny'] ?? $this->outputPriceCny;
            foreach (['input_price_cny' => 'input_price', 'output_price_cny' => 'output_price'] as $old => $new) {
                if (array_key_exists($old, $overrides)) {
                    $data[$new] = $overrides[$old];
                }
            }
        } elseif (! $hasPrices && ! $legacyChanged && ! $currencyChanged && array_key_exists('base_price_cny', $overrides)) {
            $base = self::decimal($overrides['base_price_cny'], false, self::REFERENCE_AMOUNT_SCALE, 24);
            if ($base === null || $this->basePriceCny === null || bccomp($base, $this->basePriceCny, self::REFERENCE_AMOUNT_SCALE) !== 0) {
                $data = array_replace($data, ['currency' => 'CNY', 'input_price' => null, 'output_price' => null]);
            }
        }
        return self::fromArray($data);
    }

    /** 新旧管理端共用完整响应，旧人民币字段仅作为兼容别名返回。 */
    public function toArray(): array
    {
        return [
            'enabled' => $this->enabled,
            'base_price_cny' => $this->basePriceCny,
            'usd_to_cny_rate' => $this->usdToCnyRate,
            'input_price_cny' => $this->inputPriceCny,
            'output_price_cny' => $this->outputPriceCny,
            'currency' => $this->currency,
            'input_price' => $this->inputPrice,
            'output_price' => $this->outputPrice,
        ];
    }

    /** 单价与汇率限制十二位精度，派生金额允许完整换汇精度，拒绝非法数值。 */
    private static function decimal(mixed $value, bool $allowZero = false, int $scale = 12, int $integerDigits = 12): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $decimal = is_string($value) || is_int($value) || is_float($value) ? (string) $value : '';
        if (! preg_match('/^\d{1,' . $integerDigits . '}(?:\.\d{1,' . $scale . '})?$/D', $decimal) || (! $allowZero && bccomp($decimal, '0', $scale) <= 0)) {
            throw new InvalidArgumentException('Model multiplier amounts must be valid decimals within the allowed precision');
        }
        return $decimal;
    }
}
