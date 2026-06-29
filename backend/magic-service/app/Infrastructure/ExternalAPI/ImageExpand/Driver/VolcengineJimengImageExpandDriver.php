<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageExpand\Driver;

use App\Infrastructure\ExternalAPI\ImageExpand\DTO\ImageExpandDriverRequest;
use App\Infrastructure\ExternalAPI\ImageExpand\DTO\ImageExpandDriverResponse;
use App\Infrastructure\ExternalAPI\ImageExpand\Exception\ImageExpandDriverException;
use App\Infrastructure\ExternalAPI\ImageExpand\ImageExpandDriverFactory;
use App\Infrastructure\ExternalAPI\ImageExpand\ImageExpandDriverInterface;
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

class VolcengineJimengImageExpandDriver implements ImageExpandDriverInterface
{
    private const REQ_KEY = 'jimeng_img2img_seed3_painting_edit';

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
        return ImageExpandDriverFactory::PROVIDER_JIMENG;
    }

    public function expand(ImageExpandDriverRequest $request): ImageExpandDriverResponse
    {
        [$accessKey, $secretKey] = $this->resolveCredentials();
        $body = $this->buildSubmitBody($request, $this->resolvePrompt(), $this->resolveConfigSeed());

        try {
            $client = new VolcengineVisualAsyncClient($accessKey, $secretKey, $this->loggerFactory);
            $submitResponse = $client->submitTask($body);
            $taskId = (string) ($submitResponse['data']['task_id'] ?? '');
            if ($taskId === '') {
                throw new ImageExpandDriverException('Volcengine Jimeng outpainting task id missing', null, $this->getProviderCode());
            }

            $result = $client->pollTaskResult($taskId, self::REQ_KEY, ['return_url' => true]);
            $resultUrl = (string) ($result['data']['image_urls'][0] ?? '');
            if ($resultUrl === '') {
                throw new ImageExpandDriverException('Volcengine Jimeng outpainting result url missing', null, $this->getProviderCode());
            }

            return $this->downloadResultImage($resultUrl);
        } catch (ImageExpandDriverException $exception) {
            throw $exception;
        } catch (VolcengineVisualAsyncClientException $exception) {
            throw new ImageExpandDriverException($exception->getMessage(), $exception->getProviderErrorCode(), $this->getProviderCode());
        } catch (Throwable $throwable) {
            $this->logger->error('VolcengineJimengImageExpandDriverException', [
                'error' => $throwable->getMessage(),
            ]);
            throw new ImageExpandDriverException($throwable->getMessage(), null, $this->getProviderCode());
        }
    }

    /**
     * 即梦画布扩展模式使用画布图 + mask 图，不再传 top/bottom/left/right 等比例扩图参数。
     *
     * @return array<string, mixed>
     */
    private function buildSubmitBody(ImageExpandDriverRequest $request, ?string $fallbackPrompt = null, ?int $fallbackSeed = null): array
    {
        $prompt = trim((string) ($request->getCustomPrompt() ?? ''));
        if ($prompt === '') {
            $prompt = trim((string) $fallbackPrompt);
        }

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
    private function buildImagePayload(ImageExpandDriverRequest $request): array
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
            throw new InvalidArgumentException('image_generate.image_expand_provider_not_configured');
        }

        return [$accessKey, $secretKey];
    }

    private function resolvePrompt(): ?string
    {
        $prompt = trim((string) ($this->providerConfig['prompt'] ?? ($this->providerConfig['default_prompt'] ?? '')));
        return $prompt !== '' ? $prompt : null;
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

    private function downloadResultImage(string $resultUrl): ImageExpandDriverResponse
    {
        try {
            $tempFile = TemporaryFileManager::createTempFile('volcengine_jimeng_expand_');
        } catch (RuntimeException) {
            throw new InvalidArgumentException('image_generate.create_temp_file_failed');
        }

        try {
            $safeResultUrl = SSRFUtil::getSafeUrl($resultUrl, replaceIp: false);
            $response = $this->createClient()->get($safeResultUrl, [
                RequestOptions::SINK => $tempFile,
            ]);
            if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
                throw new ImageExpandDriverException('Failed to download volcengine Jimeng expand result image', $response->getStatusCode(), $this->getProviderCode());
            }

            $mimeType = $this->imageFileInspector->assertImageFile($tempFile);
            return new ImageExpandDriverResponse($tempFile, $mimeType);
        } catch (Throwable $throwable) {
            if (is_file($tempFile)) {
                @unlink($tempFile);
            }
            throw $throwable;
        }
    }
}
