<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageGenerate;

use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\VolcengineArk\VolcengineArkAPI;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\VolcengineArk\VolcengineArkModel;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\VolcengineArk\VolcengineArkRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Request\ImageGenerateRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use App\Infrastructure\ImageGenerate\ImageWatermarkProcessor;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

/**
 * @internal
 * @covers \App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\VolcengineArk\VolcengineArkModel
 */
class VolcengineArkModelResponseTest extends TestCase
{
    public function testOpenAIFormatResponseCarriesVolcengineArkTokenUsage(): void
    {
        $model = new TestableVolcengineArkModel([
            [
                'data' => [
                    [
                        'url' => 'https://example.com/generated.png',
                        'size' => '1792x2400',
                    ],
                ],
                'usage' => [
                    'input_tokens' => 12,
                    'output_tokens' => 1680,
                    'total_tokens' => 1692,
                    'generated_images' => 1,
                ],
            ],
        ]);

        $request = new VolcengineArkRequest('1792', '2400', '小猫吃鱼', '', 'doubao-seedream');

        $response = $model->generateImageOpenAIFormat($request);

        $this->assertSame([
            [
                'url' => 'https://example.com/generated.png',
                'size' => '1792x2400',
            ],
        ], $response->getData());
        $this->assertNotNull($response->getUsage());
        $this->assertSame([
            'prompt_tokens' => 12,
            'completion_tokens' => 1680,
            'total_tokens' => 1692,
            'generated_images' => 1,
            'thoughts_tokens' => 0,
        ], $response->getUsage()->toArray());
    }

    public function testOpenAIFormatUsesSingleVendorRequestForMultipleImages(): void
    {
        $model = new TestableVolcengineArkModel([
            [
                'data' => [
                    [
                        'url' => 'https://example.com/generated-1.png',
                        'size' => '2048x2048',
                    ],
                    [
                        'url' => 'https://example.com/generated-2.png',
                        'size' => '2048x2048',
                    ],
                    [
                        'url' => 'https://example.com/generated-3.png',
                        'size' => '2048x2048',
                    ],
                ],
                'usage' => [
                    'input_tokens' => 10,
                    'output_tokens' => 300,
                    'total_tokens' => 310,
                    'generated_images' => 3,
                ],
            ],
        ]);

        $request = new VolcengineArkRequest('2048', '2048', '小猫吃鱼', '', 'doubao-seedream');
        $request->setGenerateNum(3);
        $request->setSequentialImageGeneration('auto');
        $request->setSequentialImageGenerationOptions(['max_images' => 3]);

        $response = $model->generateImageOpenAIFormat($request);

        $this->assertSame(1, $model->getRequestCallCount());
        $this->assertSame([
            ['url' => 'https://example.com/generated-1.png', 'size' => '2048x2048'],
            ['url' => 'https://example.com/generated-2.png', 'size' => '2048x2048'],
            ['url' => 'https://example.com/generated-3.png', 'size' => '2048x2048'],
        ], $response->getData());
        $this->assertSame(3, $response->getUsage()?->getGeneratedImages());
    }

    public function testOpenAIFormatAppendsRequestedImageCountToPromptForMultipleImages(): void
    {
        $api = new CapturingVolcengineArkAPI();
        $model = new PayloadCapturingVolcengineArkModel($api);

        $request = new VolcengineArkRequest('1024', '1024', '生成一张小猫在游泳', '', 'doubao-seedream');
        $request->setGenerateNum(4);
        $request->setSequentialImageGeneration('auto');
        $request->setSequentialImageGenerationOptions(['max_images' => 4]);

        $model->generateImageOpenAIFormat($request);

        $this->assertSame("生成一张小猫在游泳\n要求返回4张图", $api->getLastPayload()['prompt'] ?? null);
    }
}

final class TestableVolcengineArkModel extends VolcengineArkModel
{
    private int $requestCallCount = 0;

    public function __construct(private array $queuedResults)
    {
        $this->logger = new NullLogger();
        $this->watermarkProcessor = new class extends ImageWatermarkProcessor {
            public function addWatermarkToUrl(string $imageUrl, ImageGenerateRequest $imageGenerateRequest): string
            {
                return $imageUrl;
            }
        };
    }

    public function getRequestCallCount(): int
    {
        return $this->requestCallCount;
    }

    protected function requestImageGenerationV2(VolcengineArkRequest $imageGenerateRequest): array
    {
        ++$this->requestCallCount;
        return array_shift($this->queuedResults);
    }

    protected function lockResponse(OpenAIFormatResponse $response): string
    {
        return 'test-owner';
    }

    protected function unlockResponse(OpenAIFormatResponse $response, string $owner): void
    {
    }
}

final class PayloadCapturingVolcengineArkModel extends VolcengineArkModel
{
    public function __construct(CapturingVolcengineArkAPI $api)
    {
        $this->api = $api;
        $this->logger = new NullLogger();
        $this->watermarkProcessor = new class extends ImageWatermarkProcessor {
            public function addWatermarkToUrl(string $imageUrl, ImageGenerateRequest $imageGenerateRequest): string
            {
                return $imageUrl;
            }
        };
    }

    protected function lockResponse(OpenAIFormatResponse $response): string
    {
        return 'test-owner';
    }

    protected function unlockResponse(OpenAIFormatResponse $response, string $owner): void
    {
    }
}

final class CapturingVolcengineArkAPI extends VolcengineArkAPI
{
    private array $lastPayload = [];

    public function __construct()
    {
    }

    public function generateImage(array $payload): array
    {
        $this->lastPayload = $payload;

        return [
            'data' => [
                [
                    'url' => 'https://example.com/generated.png',
                    'size' => '1024x1024',
                ],
            ],
            'usage' => [
                'generated_images' => 1,
            ],
        ];
    }

    public function getLastPayload(): array
    {
        return $this->lastPayload;
    }
}
