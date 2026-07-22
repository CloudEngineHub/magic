<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Provider\Service;

use App\Application\Provider\Service\ProviderModelPricingTemplateAppService;
use App\Domain\Provider\DTO\Item\BillingType;
use App\Domain\Provider\DTO\Item\TokenPricing\BillingObject;
use App\Domain\Provider\Entity\ValueObject\Category;
use App\Domain\Provider\Entity\ValueObject\ProviderCode;
use App\Interfaces\Provider\Facade\ServiceProviderApi;
use Hyperf\HttpServer\Contract\RequestInterface;
use PHPUnit\Framework\TestCase;
use ReflectionProperty;

/**
 * @internal
 */
class ProviderModelPricingTemplateAppServiceTest extends TestCase
{
    public function testQueriesReturnsProviderSpecificTemplate(): void
    {
        $service = new ProviderModelPricingTemplateAppService($this->templatesConfig());

        $templates = $service->queries(Category::VGM, ProviderCode::Keling);

        self::assertCount(1, $templates);
        self::assertSame(BillingType::KelingVideoResolutionMediaConditionDurationPricing->value, $templates[0]['code']);
        self::assertSame(Category::VGM->value, $templates[0]['category']);
        self::assertSame(BillingType::KelingVideoResolutionMediaConditionDurationPricing->value, $templates[0]['billing_type']);
        self::assertContains(
            BillingObject::videoAudioDuration('720p')->value,
            array_column($templates[0]['items'], 'billing_object')
        );
    }

    public function testQueriesFallsBackToCategoryDefaultsWhenProviderTemplateMissing(): void
    {
        $service = new ProviderModelPricingTemplateAppService($this->templatesConfig());

        $templates = $service->queries(Category::VGM, ProviderCode::OpenAI);

        self::assertCount(1, $templates);
        self::assertSame(BillingType::VideoResolutionDuration->value, $templates[0]['code']);
    }

    public function testQueriesReturnsModelSpecificTemplateWhenModelIdMatches(): void
    {
        $service = new ProviderModelPricingTemplateAppService($this->templatesConfig());

        $templates = $service->queries(Category::VLM, ProviderCode::VolcengineArk, 'seedream-5-pro');

        self::assertCount(1, $templates);
        self::assertSame(BillingType::Seedream5ProImage->value, $templates[0]['code']);
    }

    public function testQueriesSkipsModelSpecificTemplateWhenModelIdMissing(): void
    {
        $service = new ProviderModelPricingTemplateAppService($this->templatesConfig());

        $templates = $service->queries(Category::VLM, ProviderCode::VolcengineArk);

        self::assertCount(1, $templates);
        self::assertSame(BillingType::ImageTokens->value, $templates[0]['code']);
    }

    public function testQueriesDeduplicatesMergedTemplateCodes(): void
    {
        $config = $this->templatesConfig();
        $config['defaults'][Category::VLM->value][] = BillingType::ImageTokens->value;

        $service = new ProviderModelPricingTemplateAppService($config);

        $templates = $service->queries(Category::VLM, ProviderCode::VolcengineArk);

        self::assertCount(1, $templates);
        self::assertSame([BillingType::ImageTokens->value], array_column($templates, 'code'));
    }

    public function testApiFallsBackToModelVersionWhenModelIdIsBlank(): void
    {
        $request = $this->createRequest([
            'category' => Category::VLM->value,
            'provider_code' => ProviderCode::VolcengineArk->value,
            'model_id' => '   ',
            'model_version' => 'seedream-5-pro',
        ]);
        $api = new ServiceProviderApi($request);
        $serviceProperty = new ReflectionProperty(ServiceProviderApi::class, 'providerModelPricingTemplateAppService');
        $serviceProperty->setValue(
            $api,
            new ProviderModelPricingTemplateAppService($this->templatesConfig())
        );

        $templates = $api->queriesProviderModelPricingTemplates($request);

        self::assertCount(1, $templates);
        self::assertSame(BillingType::Seedream5ProImage->value, $templates[0]['code']);
    }

    private function templatesConfig(): array
    {
        return [
            'templates' => [
                [
                    'code' => BillingType::ImageTokens->value,
                    'label' => '图片 Token 计费',
                    'category' => Category::VLM->value,
                    'billing_type' => BillingType::ImageTokens->value,
                    'items' => [
                        [
                            'billing_object' => BillingObject::IMAGE_OUTPUT_TOKEN,
                            'label' => '图片输出 Token',
                        ],
                        [
                            'billing_object' => BillingObject::IMAGE_OUTPUT_TOKEN_COST,
                            'label' => '图片输出 Token 成本',
                        ],
                    ],
                ],
                [
                    'code' => BillingType::Seedream5ProImage->value,
                    'label' => 'Seedream 5 Pro 图片计费',
                    'category' => Category::VLM->value,
                    'billing_type' => BillingType::Seedream5ProImage->value,
                    'items' => [
                        [
                            'billing_object' => BillingObject::IMAGE_REFERENCE_INPUT_COUNT,
                            'label' => '额外参考输入图片单价',
                        ],
                    ],
                ],
                [
                    'code' => BillingType::VideoResolutionDuration->value,
                    'label' => '视频按分辨率时长计费',
                    'category' => Category::VGM->value,
                    'billing_type' => BillingType::VideoResolutionDuration->value,
                    'items' => [
                        [
                            'billing_object' => BillingObject::videoDuration('720p')->value,
                            'label' => '720P 视频输出时长',
                        ],
                    ],
                ],
                [
                    'code' => BillingType::KelingVideoResolutionMediaConditionDurationPricing->value,
                    'label' => '可灵视频按规格与输入条件时长计费',
                    'category' => Category::VGM->value,
                    'billing_type' => BillingType::KelingVideoResolutionMediaConditionDurationPricing->value,
                    'items' => [
                        [
                            'billing_object' => BillingObject::videoAudioDuration('720p')->value,
                            'label' => '标准模式（720P）无参考视频带音频输出时长',
                        ],
                    ],
                ],
            ],
            'defaults' => [
                Category::VLM->value => [
                    BillingType::ImageTokens->value,
                ],
                Category::VGM->value => [
                    BillingType::VideoResolutionDuration->value,
                ],
            ],
            'model_templates' => [
                [
                    'provider_code' => ProviderCode::VolcengineArk->value,
                    'category' => Category::VLM->value,
                    'model_ids' => [
                        'seedream-5-pro',
                    ],
                    'template_codes' => [
                        BillingType::Seedream5ProImage->value,
                    ],
                ],
            ],
            'provider_templates' => [
                [
                    'provider_code' => ProviderCode::OpenAI->value,
                    'category' => Category::VLM->value,
                    'template_codes' => [
                        BillingType::ImageTokens->value,
                    ],
                ],
                [
                    'provider_code' => ProviderCode::Keling->value,
                    'category' => Category::VGM->value,
                    'template_codes' => [
                        BillingType::KelingVideoResolutionMediaConditionDurationPricing->value,
                    ],
                ],
            ],
        ];
    }

    private function createRequest(array $inputs): RequestInterface
    {
        $request = $this->createMock(RequestInterface::class);
        $request
            ->method('input')
            ->willReturnCallback(static fn (string $key, mixed $default = null): mixed => $inputs[$key] ?? $default);

        return $request;
    }
}
