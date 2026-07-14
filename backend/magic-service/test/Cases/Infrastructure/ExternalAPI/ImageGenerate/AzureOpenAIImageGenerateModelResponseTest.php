<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageGenerate;

use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\AzureOpenAI\AzureOpenAIImageGenerateModel;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Request\AzureOpenAIImageRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Request\ImageGenerateRequest;
use App\Infrastructure\ImageGenerate\ImageWatermarkProcessor;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

/**
 * @internal
 * @covers \App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\AzureOpenAI\AzureOpenAIImageGenerateModel
 */
class AzureOpenAIImageGenerateModelResponseTest extends TestCase
{
    public function testOpenAIFormatResponseAcceptsAzureUrlImageData(): void
    {
        $model = new TestableAzureOpenAIImageGenerateModel([
            'created' => 1716288000,
            'data' => [
                [
                    'url' => 'https://oss.anta.com/aigc/xyz789.png',
                ],
            ],
        ]);

        $request = new AzureOpenAIImageRequest('1024', '1024', '生成一张白色图片');

        $response = $model->generateImageOpenAIFormat($request);

        $this->assertSame([
            [
                'url' => 'https://oss.anta.com/aigc/xyz789.png',
            ],
        ], $response->getData());
        $this->assertNotNull($response->getUsage());
        $this->assertSame(1, $response->getUsage()->getGeneratedImages());
    }
}

final class TestableAzureOpenAIImageGenerateModel extends AzureOpenAIImageGenerateModel
{
    public function __construct(private readonly array $result)
    {
        $this->logger = new NullLogger();
        $this->watermarkProcessor = new class extends ImageWatermarkProcessor {
            public function addWatermarkToUrl(string $imageUrl, ImageGenerateRequest $imageGenerateRequest): string
            {
                return $imageUrl;
            }
        };
    }

    public function generateImageRaw(ImageGenerateRequest $imageGenerateRequest): array
    {
        return $this->result;
    }
}
