<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\ImageGenerate;

use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google\Client\GoogleGeminiInterface;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google\GoogleGeminiModel;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google\GoogleGeminiRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Model\Google\GoogleReferenceImagePreparer;
use Dtyq\CloudFile\Kernel\Struct\DownloadedRemoteFile;
use Dtyq\CloudFile\Kernel\Utils\SafeRemoteFileDownloader;
use LogicException;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
final class GoogleGeminiReferenceImageTest extends TestCase
{
    public function testUrlStrategySendsFileDataWithoutDownloading(): void
    {
        $api = new class implements GoogleGeminiInterface {
            /** @var list<array> */
            public array $images = [];

            public function setModelId(string $modelId): void
            {
            }

            public function generateContent(string $prompt, array $images = [], array $config = []): array
            {
                $this->images[] = $images;
                return ['candidates' => []];
            }

            public function uploadFile(string $filePath, string $mimeType): string
            {
                return '';
            }
        };

        $model = new GoogleGeminiModel([
            'api_key' => 'test-key',
            'model_version' => 'gemini-image',
            'reference_image_transport' => 'url',
        ]);
        $apiProperty = (new ReflectionClass($model))->getProperty('api');
        $apiProperty->setAccessible(true);
        $apiProperty->setValue($model, $api);
        $preparerProperty = (new ReflectionClass($model))->getProperty('referenceImagePreparer');
        $preparerProperty->setAccessible(true);
        $preparerProperty->setValue($model, new GoogleReferenceImagePreparer(new class extends SafeRemoteFileDownloader {
            public function download(string $source): DownloadedRemoteFile
            {
                throw new LogicException('URL strategy must not download reference images');
            }
        }));
        $method = (new ReflectionClass($model))->getMethod('requestImageGeneration');
        $method->setAccessible(true);

        $request = new GoogleGeminiRequest('1024', '1024', '编辑图片', '', 'gemini-image');
        $request->setReferImages(['https://oss.example.com/reference.png']);

        $method->invoke($model, $request);

        $this->assertSame('fileData', $api->images[0][0]['type']);
        $this->assertSame('https://oss.example.com/reference.png', $api->images[0][0]['fileUri']);
    }

    public function testUrlFailureFallsBackToBase64(): void
    {
        $api = new class implements GoogleGeminiInterface {
            public int $calls = 0;

            /** @var list<array> */
            public array $images = [];

            public function setModelId(string $modelId): void
            {
            }

            public function generateContent(string $prompt, array $images = [], array $config = []): array
            {
                ++$this->calls;
                $this->images[] = $images;
                if ($this->calls <= 3) {
                    throw new LogicException('url failed');
                }

                return ['candidates' => [[
                    'content' => ['parts' => [[
                        'inlineData' => ['data' => 'generated-image'],
                    ]]],
                ]]];
            }

            public function uploadFile(string $filePath, string $mimeType): string
            {
                return '';
            }
        };

        $path = tempnam(sys_get_temp_dir(), 'google-reference-');
        file_put_contents($path, 'reference-image');
        $downloader = new class($path) extends SafeRemoteFileDownloader {
            public function __construct(private readonly string $path)
            {
            }

            public function download(string $source): DownloadedRemoteFile
            {
                return new DownloadedRemoteFile($this->path, 'reference.png', 'image/png', 15);
            }
        };

        $model = new GoogleGeminiModel([
            'api_key' => 'test-key',
            'model_version' => 'gemini-image',
            'reference_image_transport' => 'url_fallback_base64',
        ]);
        $reflection = new ReflectionClass($model);
        $reflection->getProperty('api')->setValue($model, $api);
        $reflection->getProperty('referenceImagePreparer')->setValue($model, new GoogleReferenceImagePreparer($downloader));
        $method = $reflection->getMethod('requestImageGenerationWithFallback');

        $request = new GoogleGeminiRequest('1024', '1024', '编辑图片', '', 'gemini-image');
        $request->setReferImages(['https://oss.example.com/reference.png']);

        $result = $method->invoke($model, $request);

        $this->assertSame(4, $api->calls);
        $this->assertSame('fileData', $api->images[0][0]['type']);
        $this->assertSame('base64', $api->images[3][0]['type']);
        $this->assertSame('generated-image', $result['candidates'][0]['content']['parts'][0]['inlineData']['data']);
    }
}
