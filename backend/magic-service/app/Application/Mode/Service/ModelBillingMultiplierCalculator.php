<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Mode\Service;

use App\Application\Kernel\DTO\ModelBillingMultiplierSettings;
use App\Domain\Provider\DTO\Item\ModelConfigItem;
use App\Domain\Provider\DTO\Item\TokenPricing\BillingObject;
use App\Domain\Provider\Entity\ProviderModelEntity;

/** 基于已过滤的服务商快照计算参考倍率，不查询数据库、不触发动态路由。 */
class ModelBillingMultiplierCalculator
{
    // 十二位源单价与十二位汇率相乘后仍保留足够精度。
    private const int SCALE = 36;

    /** 使用能力解析的同一真实模型标识，每个绑定等权，仅跳过无效绑定。 */
    public function calculate(array $capabilities, array $availableGroups, ModelBillingMultiplierSettings $settings): array
    {
        $result = [];
        $resolvedMultipliers = [];
        foreach ($capabilities as $modelId => $capability) {
            if (! $settings->enabled) {
                $result[$modelId] = null;
                continue;
            }
            $resolvedId = $capability['resolved_model_id'];
            if (! array_key_exists($resolvedId, $resolvedMultipliers)) {
                $sum = '0';
                $count = 0;
                foreach ($availableGroups[$resolvedId] ?? [] as $model) {
                    if ($model->isDynamicModel()) {
                        continue;
                    }
                    $amount = $this->referenceAmount($model, $settings);
                    if ($amount !== null) {
                        $sum = bcadd($sum, $amount, self::SCALE);
                        ++$count;
                    }
                }
                $resolvedMultipliers[$resolvedId] = $count === 0 ? 0.0 : (float) bcdiv(
                    bcdiv($sum, (string) $count, self::SCALE),
                    $settings->basePriceCny,
                    self::SCALE
                );
            }
            $result[$modelId] = $resolvedMultipliers[$resolvedId];
        }
        return $result;
    }

    /** 固定参考输入一万、输出一千 token；金额均转换为人民币后再平均。 */
    private function referenceAmount(ProviderModelEntity $model, ModelBillingMultiplierSettings $settings): ?string
    {
        $config = $model->getConfig();
        if ($config === null || ! $config->getBillingType()->isTokens()) {
            return null;
        }
        $currency = $config->getBillingCurrency();
        if (! in_array($currency, ['CNY', 'USD'], true)) {
            return null;
        }
        $input = $this->averageUnitPrice($config, BillingObject::INPUT_TOKEN);
        $output = $this->averageUnitPrice($config, BillingObject::OUTPUT_TOKEN);
        if ($input === null || $output === null) {
            return null;
        }
        $amount = bcadd(bcmul($input, '0.01', self::SCALE), bcmul($output, '0.001', self::SCALE), self::SCALE);
        return $currency === 'USD' ? bcmul($amount, $settings->usdToCnyRate, self::SCALE) : $amount;
    }

    /** 兼容现有价格对象的浮点及科学计数法输出，非法历史价格不参与计算。 */
    private function decimalPrice(?string $price): ?string
    {
        if ($price === null || ! is_numeric($price) || ! is_finite((float) $price) || (float) $price < 0) {
            return null;
        }
        return preg_match('/^\d+(?:\.\d+)?$/D', $price) ? $price : sprintf('%.24F', (float) $price);
    }

    /** 缺失计费项按零计算，阶梯逐档等权，不混入成本和旧版兜底价格。 */
    private function averageUnitPrice(ModelConfigItem $config, string $object): ?string
    {
        $tiers = $config->getBillingTiers();
        if ($tiers === null) {
            $price = $object === BillingObject::INPUT_TOKEN ? $config->getInputPricing() : $config->getOutputPricing();
            return $price === null ? '0' : $this->decimalPrice($price);
        }
        $tier = $tiers->getBillingTier($object);
        if ($tier === null) {
            return '0';
        }
        // 缺失计费项与已存在但规则无效不同，后者仍跳过整个绑定。
        $rules = $tier->getPricingRules();
        if ($rules === []) {
            return null;
        }
        $sum = '0';
        foreach ($rules as $rule) {
            $price = $this->decimalPrice((string) $rule->getPrice());
            if ($price === null) {
                return null;
            }
            $sum = bcadd($sum, $price, self::SCALE);
        }
        return bcdiv($sum, (string) count($rules), self::SCALE);
    }
}
