<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageEraser\Driver;

use App\Infrastructure\ExternalAPI\ImageEraser\DTO\ImageEraserDriverRequest;
use App\Infrastructure\ExternalAPI\ImageEraser\DTO\ImageEraserDriverResponse;
use App\Infrastructure\ExternalAPI\ImageEraser\Exception\ImageEraserDriverException;
use App\Infrastructure\ExternalAPI\ImageEraser\ImageEraserDriverFactory;
use App\Infrastructure\ExternalAPI\ImageEraser\ImageEraserDriverInterface;
use App\Infrastructure\ExternalAPI\Volcengine\VolcengineVisualAsyncClient;
use App\Infrastructure\ExternalAPI\Volcengine\VolcengineVisualAsyncClientException;
use App\Infrastructure\Util\File\ImageFileInspector;
use App\Infrastructure\Util\File\TemporaryFileManager;
use App\Infrastructure\Util\Http\GuzzleClientFactory;
use App\Infrastructure\Util\SSRF\SSRFUtil;
use GuzzleHttp\Client;
use GuzzleHttp\RequestOptions;
use Hyperf\Logger\LoggerFactory;
use InvalidArgumentException;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Throwable;

class VolcengineJimengImageEraserDriver implements ImageEraserDriverInterface
{
    private const REQ_KEY = 'jimeng_image2image_dream_inpaint';

    private const DEFAULT_PROMPT = '删除';

    private LoggerInterface $logger;

    /**
     * @param array<string, mixed> $providerConfig
     */
    public function __construct(
        private readonly array $providerConfig,
        private readonly ImageFileInspector $imageFileInspector,
        private readonly LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get(static::class);
    }

    public function getProviderCode(): string
    {
        return ImageEraserDriverFactory::PROVIDER_JIMENG;
    }

    public function erase(ImageEraserDriverRequest $request): ImageEraserDriverResponse
    {
        [$accessKey, $secretKey] = $this->resolveCredentials();
        $body = $this->buildSubmitBody($request, $this->resolvePrompt(), $this->resolveConfigSeed());

        try {
            $client = new VolcengineVisualAsyncClient($accessKey, $secretKey, $this->loggerFactory);
            $submitResponse = $client->submitTask($body);
            $taskId = (string) ($submitResponse['data']['task_id'] ?? '');
            if ($taskId === '') {
                throw new ImageEraserDriverException('Volcengine Jimeng inpainting task id missing', null, $this->getProviderCode());
            }

            $result = $client->pollTaskResult($taskId, self::REQ_KEY, ['return_url' => true]);
            $resultUrl = (string) ($result['data']['image_urls'][0] ?? '');
            if ($resultUrl === '') {
                throw new ImageEraserDriverException('Volcengine Jimeng inpainting result url missing', null, $this->getProviderCode());
            }

            return $this->downloadResultImage($resultUrl);
        } catch (ImageEraserDriverException $exception) {
            throw $exception;
        } catch (VolcengineVisualAsyncClientException $exception) {
            throw new ImageEraserDriverException($exception->getMessage(), $exception->getProviderErrorCode(), $this->getProviderCode());
        } catch (Throwable $throwable) {
            $this->logger->error('VolcengineJimengImageEraserDriverException', [
                'error' => $throwable->getMessage(),
            ]);
            throw new ImageEraserDriverException($throwable->getMessage(), null, $this->getProviderCode());
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function buildSubmitBody(ImageEraserDriverRequest $request, string $prompt, ?int $fallbackSeed = null): array
    {
        return array_filter([
            'req_key' => self::REQ_KEY,
            ...$this->buildImagePayload($request),
            'prompt' => $prompt,
            'seed' => $request->getSeed() ?? $fallbackSeed,
        ], static fn ($value) => $value !== null && $value !== '');
    }

    /**
     * @return array<string, mixed>
     */
    private function buildImagePayload(ImageEraserDriverRequest $request): array
    {
        $imageInput = $request->getImageInput();
        $maskInput = $request->getMaskInput();

        if ($imageInput->isBase64() !== $maskInput->isBase64()) {
            throw new InvalidArgumentException('image_generate.mixed_image_input_not_supported');
        }

        return $imageInput->isBase64()
            ? ['binary_data_base64' => [$imageInput->getBase64Data(), $maskInput->getBase64Data()]]
            : ['image_urls' => [$imageInput->getValue(), $maskInput->getValue()]];
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function resolveCredentials(): array
    {
        $accessKey = trim((string) ($this->providerConfig['access_key'] ?? ($this->providerConfig['ak'] ?? '')));
        $secretKey = trim((string) ($this->providerConfig['secret_key'] ?? ($this->providerConfig['sk'] ?? '')));
        if ($accessKey === '' || $secretKey === '') {
            throw new InvalidArgumentException('image_generate.image_eraser_provider_not_configured');
        }

        return [$accessKey, $secretKey];
    }

    private function resolvePrompt(): string
    {
        $prompt = trim((string) ($this->providerConfig['prompt'] ?? ($this->providerConfig['default_prompt'] ?? '')));
        return $prompt !== '' ? $prompt : self::DEFAULT_PROMPT;
    }

    private function resolveConfigSeed(): ?int
    {
        if (! isset($this->providerConfig['seed']) || $this->providerConfig['seed'] === '') {
            return null;
        }

        return (int) $this->providerConfig['seed'];
    }

    private function createClient(): Client
    {
        return GuzzleClientFactory::createProxyClient([
            RequestOptions::TIMEOUT => (int) ($this->providerConfig['timeout'] ?? 300),
            'http_errors' => false,
        ]);
    }

    private function downloadResultImage(string $resultUrl): ImageEraserDriverResponse
    {
        try {
            $tempFile = TemporaryFileManager::createTempFile('volcengine_jimeng_eraser_');
        } catch (RuntimeException) {
            throw new InvalidArgumentException('image_generate.create_temp_file_failed');
        }

        try {
            $safeResultUrl = SSRFUtil::getSafeUrl($resultUrl, replaceIp: false);
            $response = $this->createClient()->get($safeResultUrl, [
                RequestOptions::SINK => $tempFile,
            ]);
            if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
                throw new ImageEraserDriverException('Failed to download volcengine Jimeng eraser result image', $response->getStatusCode(), $this->getProviderCode());
            }

            $mimeType = $this->imageFileInspector->assertImageFile($tempFile);
            return new ImageEraserDriverResponse($tempFile, $mimeType);
        } catch (Throwable $throwable) {
            if (is_file($tempFile)) {
                @unlink($tempFile);
            }
            throw $throwable;
        }
    }
}
