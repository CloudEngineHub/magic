<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\ModelGateway\Service;

use App\Application\ModelGateway\Service\LLMAppService;
use App\Domain\Provider\Entity\ValueObject\ProviderCode;
use App\Infrastructure\ExternalAPI\FileUrlProxy\TemporaryFileUrlProxyManager;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\ImageGenerate;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\ImageGenerateType;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Request\ImageGenerateRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Request\OpenRouterRequest;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\ImageGenerateResponse;
use App\Infrastructure\ExternalAPI\ImageGenerateAPI\Response\OpenAIFormatResponse;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionProperty;

/**
 * @internal
 * @covers \App\Application\ModelGateway\Service\LLMAppService
 */
final class LLMAppServiceFileUrlProxyTest extends TestCase
{
    public function testGenerateImageOpenAIFormatWithFileUrlProxyUsesProxyForGoogleProvider(): void
    {
        $shortUrl = 'https://short-url.pages.letsmagic.space/17829009419c4bbeb3';
        $mock = new MockHandler([
            new Response(200, [], $shortUrl),
            new Response(204),
        ]);
        $service = $this->createService($mock);
        $imageGenerateService = new RecordingImageGenerateService();

        $imageUrl = 'https://magic-sandbox.tos-cn-beijing.volces.com/path/input.png?X-Tos-Signature=abc';
        $request = new ImageGenerateRequest('1024', '1024', '编辑图片', '', 'gemini-image');
        $request->setReferImages([$imageUrl]);

        $response = $this->invokePrivate($service, 'generateImageOpenAIFormatWithFileUrlProxy', [
            $imageGenerateService,
            $request,
            ProviderCode::Google,
        ]);

        $this->assertInstanceOf(OpenAIFormatResponse::class, $response);
        $this->assertSame([$shortUrl], $imageGenerateService->openAIFormatReferImages);
        $this->assertSame([$imageUrl], $request->getReferImages());
        $this->assertSame(0, $mock->count());
    }

    public function testGenerateImageOpenAIFormatWithFileUrlProxyUsesProxyForOpenRouterProvider(): void
    {
        $shortUrl = 'https://short-url.pages.letsmagic.space/17829009419c4bbeb3';
        $mock = new MockHandler([
            new Response(200, [], $shortUrl),
            new Response(204),
        ]);
        $service = $this->createService($mock);
        $imageGenerateService = new RecordingImageGenerateService();

        $imageUrl = 'https://magic-sandbox.tos-cn-beijing.volces.com/path/input.png?X-Tos-Signature=abc';
        $request = new OpenRouterRequest('1024', '1024', 'openrouter-image', '编辑图片');
        $request->setReferImages([$imageUrl]);

        $response = $this->invokePrivate($service, 'generateImageOpenAIFormatWithFileUrlProxy', [
            $imageGenerateService,
            $request,
            ProviderCode::OpenRouter,
        ]);

        $this->assertInstanceOf(OpenAIFormatResponse::class, $response);
        $this->assertSame([$shortUrl], $imageGenerateService->openAIFormatReferImages);
        $this->assertSame([$shortUrl], $imageGenerateService->openRouterMessageImageUrls);
        $this->assertSame([$imageUrl], $request->getReferImages());
        $this->assertSame(0, $mock->count());
    }

    private function createService(MockHandler $mock): LLMAppService
    {
        $reflection = new ReflectionClass(LLMAppService::class);
        /** @var LLMAppService $service */
        $service = $reflection->newInstanceWithoutConstructor();

        $property = new ReflectionProperty(LLMAppService::class, 'temporaryFileUrlProxyManager');
        $property->setAccessible(true);
        $property->setValue($service, new TemporaryFileUrlProxyManager(
            'https://short-url.pages.letsmagic.space',
            new Client([
                'handler' => HandlerStack::create($mock),
                'http_errors' => false,
            ])
        ));

        return $service;
    }

    /**
     * @param array<int, mixed> $arguments
     */
    private function invokePrivate(LLMAppService $service, string $methodName, array $arguments): mixed
    {
        $method = new ReflectionClass(LLMAppService::class)->getMethod($methodName);
        $method->setAccessible(true);
        return $method->invokeArgs($service, $arguments);
    }
}

final class RecordingImageGenerateService implements ImageGenerate
{
    public array $openAIFormatReferImages = [];

    public array $openRouterMessageImageUrls = [];

    public function generateImage(ImageGenerateRequest $imageGenerateRequest): ImageGenerateResponse
    {
        return new ImageGenerateResponse(ImageGenerateType::URL, []);
    }

    public function generateImageRaw(ImageGenerateRequest $imageGenerateRequest): array
    {
        return [];
    }

    public function generateImageRawWithWatermark(ImageGenerateRequest $imageGenerateRequest): array
    {
        return [];
    }

    public function generateImageOpenAIFormat(ImageGenerateRequest $imageGenerateRequest): OpenAIFormatResponse
    {
        $this->openAIFormatReferImages = $imageGenerateRequest->getReferImages();
        if ($imageGenerateRequest instanceof OpenRouterRequest) {
            $content = $imageGenerateRequest->toArray()['messages'][0]['content'] ?? [];
            foreach (is_array($content) ? $content : [] as $part) {
                if (($part['type'] ?? '') === 'image_url') {
                    $this->openRouterMessageImageUrls[] = $part['image_url']['url'] ?? '';
                }
            }
        }

        return new OpenAIFormatResponse([
            'created' => time(),
            'provider' => 'test',
            'data' => [],
        ]);
    }

    public function setAK(string $ak)
    {
    }

    public function setSK(string $sk)
    {
    }

    public function setApiKey(string $apiKey)
    {
    }

    public function getProviderName(): string
    {
        return 'test';
    }
}
