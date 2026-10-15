<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Kernel\DTO;

use App\Application\Kernel\DTO\ModelBillingMultiplierSettings;
use App\Application\Kernel\DTO\PlatformSettings;
use App\Application\Kernel\Service\PlatformSettingsAppService;
use App\Application\Mode\Service\ModelBillingMultiplierCalculator;
use App\Domain\Provider\Entity\ProviderModelEntity;
use App\Interfaces\Kernel\DTO\Request\PlatformSettingsUpdateRequest;
use App\Interfaces\Kernel\Facade\PlatformSettingsApi;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * 模拟单价覆盖配置兼容、精度和倍率链路，不连接数据库或真实服务商。
 * @internal
 */
final class ModelBillingMultiplierSettingsTest extends TestCase
{
    /** 新单价生成参考金额，前端回传的旧计算值不能覆盖结果。 */
    public function testTokenPricesDetermineReferenceAmount(): void
    {
        $data = ['enabled' => true, 'input_price_cny' => '2.000000000001', 'output_price_cny' => '3', 'base_price_cny' => '999'];
        $settings = ModelBillingMultiplierSettings::fromArray($data);
        $this->assertSame('0.02300000000001', $settings->basePriceCny);
        $this->assertSame('2.000000000001', $settings->inputPriceCny);
        $this->assertSame('3', $settings->outputPriceCny);
        $this->assertSame('7', $settings->usdToCnyRate);
        $restored = PlatformSettings::fromArray(['model_billing_multiplier' => $settings->toArray()]);
        $this->assertSame($settings->toArray(), $restored->toArray()['model_billing_multiplier']);
    }

    /** 最小合法输出单价不能被截断成零，最大精度回显仍可校验。 */
    public function testSmallestAndLargestPricesRemainExact(): void
    {
        $small = ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'input_price_cny' => '0', 'output_price_cny' => '0.000000000001']);
        $this->assertSame('0.000000000000001', $small->basePriceCny);
        $large = ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'input_price_cny' => '999999999999.999999999999', 'output_price_cny' => '999999999999.999999999999']);
        $this->assertSame('10999999999.999999999999989', $large->basePriceCny);
        $this->assertSame($large->toArray(), $large->withOverrides($large->toArray())->toArray());
        $request = (new ReflectionClass(PlatformSettingsUpdateRequest::class))->newInstanceWithoutConstructor();
        $rules = $request->rules();
        $this->assertSame('sometimes|nullable|string|max:25', $rules['model_billing_multiplier.input_price_cny']);
        $this->assertSame('sometimes|nullable|string|max:25', $rules['model_billing_multiplier.output_price_cny']);
        $this->assertSame('sometimes|nullable|string|max:28', $rules['model_billing_multiplier.base_price_cny']);
    }

    /** 一项可以为零；不因输入单价为零而错误回退到旧金额。 */
    public function testOneZeroPriceParticipates(): void
    {
        $this->assertSame('0.003', ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'input_price_cny' => '0', 'output_price_cny' => '3'])->basePriceCny);
        $this->assertSame('0.02', ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'input_price_cny' => '2', 'output_price_cny' => '0'])->basePriceCny);
    }

    /** 非法或不完整的新单价不能借旧金额绕过校验，关闭时同样拒绝无效已填值。 */
    public function testInvalidPricesCannotFallBackToLegacyAmount(): void
    {
        $invalidPairs = [['0', '0'], ['2', null], [null, '3'], ['-1', '3'], ['1e3', '3'], ['NaN', '3'], ['Infinity', '3'], [[], '3'], [true, '3'], ['0.0000000000001', '3'], ['1000000000000', '3']];
        foreach ([true, false] as $enabled) {
            foreach ($invalidPairs as [$input, $output]) {
                try {
                    ModelBillingMultiplierSettings::fromArray(['enabled' => $enabled, 'input_price_cny' => $input, 'output_price_cny' => $output, 'base_price_cny' => '0.1']);
                    $this->fail('Invalid token prices must be rejected');
                } catch (InvalidArgumentException) {
                    $this->addToAssertionCount(1);
                }
            }
        }
    }

    /** 历史金额无需迁移，不反推单价，美元汇率默认值完全由后端补齐。 */
    public function testHistoricalSettingsRemainReadable(): void
    {
        $empty = ModelBillingMultiplierSettings::fromArray([]);
        $this->assertFalse($empty->enabled);
        $this->assertNull($empty->basePriceCny);
        $this->assertNull($empty->inputPriceCny);
        $this->assertNull($empty->outputPriceCny);
        $this->assertSame('7', $empty->usdToCnyRate);
        foreach ([[], ['input_price_cny' => null, 'output_price_cny' => null]] as $prices) {
            $legacy = ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'base_price_cny' => '0.8', ...$prices]);
            $this->assertSame('0.8', $legacy->basePriceCny);
            $this->assertNull($legacy->inputPriceCny);
            $this->assertNull($legacy->outputPriceCny);
        }
    }

    /** 部分更新和关闭再开启保留两项单价，输入变化后重新计算。 */
    public function testPartialUpdatesPreservePrices(): void
    {
        $settings = ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'input_price_cny' => '2', 'output_price_cny' => '3', 'usd_to_cny_rate' => '5']);
        $disabled = $settings->withOverrides(['enabled' => false]);
        $this->assertFalse($disabled->enabled);
        $this->assertSame($settings->toArray(), $disabled->withOverrides(['enabled' => true])->toArray());
        $changed = $settings->withOverrides(['input_price_cny' => '4']);
        $this->assertSame('0.043', $changed->basePriceCny);
        $this->assertSame('3', $changed->outputPriceCny);
        $rateOnly = $settings->withOverrides(['usd_to_cny_rate' => '6']);
        $this->assertSame('0.023', $rateOnly->basePriceCny);
        $this->assertSame('6', $rateOnly->usdToCnyRate);
    }

    /** 旧客户端仅改金额时继续生效；原样回传金额不会清空已保存单价。 */
    public function testLegacyClientCanUpdateAmountWithoutLosingUnchangedPrices(): void
    {
        $settings = ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'input_price_cny' => '2', 'output_price_cny' => '3']);
        $this->assertSame($settings->toArray(), $settings->withOverrides(['base_price_cny' => '0.02300'])->toArray());
        $changed = $settings->withOverrides(['base_price_cny' => '0.6']);
        $this->assertSame('0.6', $changed->basePriceCny);
        $this->assertNull($changed->inputPriceCny);
        $this->assertNull($changed->outputPriceCny);
        $this->assertSame('0.023', $settings->withOverrides(['base_price_cny' => '999', 'input_price_cny' => '2', 'output_price_cny' => '3'])->basePriceCny);
    }

    /** 原倍率计算链直接使用派生金额，不需要调整模型装配或实际扣费。 */
    public function testCalculatedBaseFlowsIntoModelMultiplier(): void
    {
        $model = new ProviderModelEntity();
        $model->setModelId('mock-model');
        $model->setConfig(['billing_type' => 'TextTokens', 'billing_currency' => 'CNY', 'input_pricing' => '4', 'output_pricing' => '6']);
        $settings = ModelBillingMultiplierSettings::fromArray(['enabled' => true, 'input_price_cny' => '2', 'output_price_cny' => '3']);
        $result = (new ModelBillingMultiplierCalculator())->calculate(['mock-model' => ['resolved_model_id' => 'mock-model']], ['mock-model' => [$model]], $settings);
        $this->assertSame(2.0, $result['mock-model']);
    }

    /** 使用模拟存储验证管理接口接收新字段、返回派生金额及后续部分更新。 */
    public function testAdminApiPersistsAndReturnsCalculatedBase(): void
    {
        $stored = new PlatformSettings();
        $service = $this->createMock(PlatformSettingsAppService::class);
        $service->method('get')->willReturnCallback(static function () use (&$stored) { return $stored; });
        $service->expects($this->exactly(2))->method('save')->willReturnCallback(static function (PlatformSettings $settings) use (&$stored) {
            $stored = $settings;
            return $stored;
        });
        $api = new PlatformSettingsApi($service);
        $request = $this->createMock(PlatformSettingsUpdateRequest::class);
        $request->method('validated')->willReturn(['model_billing_multiplier' => ['enabled' => true, 'input_price_cny' => '2.000000000001', 'output_price_cny' => '3', 'base_price_cny' => null]]);
        $response = $api->update($request);
        $this->assertSame('0.02300000000001', $response['model_billing_multiplier']['base_price_cny']);
        $this->assertSame('2.000000000001', $response['model_billing_multiplier']['input_price_cny']);
        $this->assertSame('7', $response['model_billing_multiplier']['usd_to_cny_rate']);
        $disable = $this->createMock(PlatformSettingsUpdateRequest::class);
        $disable->method('validated')->willReturn(['model_billing_multiplier' => ['enabled' => false]]);
        $api->update($disable);
        $after = $api->show()['model_billing_multiplier'];
        $this->assertFalse($after['enabled']);
        $this->assertSame('2.000000000001', $after['input_price_cny']);
        $this->assertSame('0.02300000000001', $after['base_price_cny']);
    }
}
