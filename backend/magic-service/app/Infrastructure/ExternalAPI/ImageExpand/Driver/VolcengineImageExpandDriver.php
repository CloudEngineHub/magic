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

class VolcengineImageExpandDriver implements ImageExpandDriverInterface
{
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
        return ImageExpandDriverFactory::PROVIDER_VOLCENGINE;
    }

    public function expand(ImageExpandDriverRequest $request): ImageExpandDriverResponse
    {
        $ak = trim((string) ($this->providerConfig['ak'] ?? ''));
        $sk = trim((string) ($this->providerConfig['sk'] ?? ''));
        if ($ak === '' || $sk === '') {
            throw new InvalidArgumentException('image_generate.image_expand_provider_not_configured');
        }

        $body = array_filter([
            'req_key' => 'i2i_outpainting',
            'image_urls' => [$request->getImageUrl(), $request->getMaskUrl()],
            'custom_prompt' => $request->getCustomPrompt(),
            'steps' => $request->getSteps(),
            'strength' => $request->getStrength(),
            'scale' => $request->getScale(),
            'seed' => $request->getSeed(),
            'top' => $request->getTop(),
            'bottom' => $request->getBottom(),
            'left' => $request->getLeft(),
            'right' => $request->getRight(),
            'max_height' => $request->getMaxHeight(),
            'max_width' => $request->getMaxWidth(),
        ], static fn ($value) => $value !== null && $value !== '');

        try {
            $client = new VolcengineVisualAsyncClient($ak, $sk, $this->loggerFactory);
            $submitResponse = $client->submitTask($body);
            $taskId = (string) ($submitResponse['data']['task_id'] ?? '');
            if ($taskId === '') {
                throw new ImageExpandDriverException('Volcengine task id missing', null, $this->getProviderCode());
            }

            $result = $client->pollTaskResult($taskId, 'i2i_outpainting', ['return_url' => true]);
            $resultUrl = (string) ($result['data']['image_urls'][0] ?? '');
            if ($resultUrl === '') {
                throw new ImageExpandDriverException('Volcengine result url missing', null, $this->getProviderCode());
            }

            return $this->downloadResultImage($resultUrl);
        } catch (ImageExpandDriverException $exception) {
            throw $exception;
        } catch (VolcengineVisualAsyncClientException $exception) {
            throw new ImageExpandDriverException($exception->getMessage(), $exception->getProviderErrorCode(), $this->getProviderCode());
        } catch (Throwable $throwable) {
            $this->logger->error('VolcengineImageExpandDriverException', [
                'error' => $throwable->getMessage(),
            ]);
            throw new ImageExpandDriverException($throwable->getMessage(), null, $this->getProviderCode());
        }
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
            $tempFile = TemporaryFileManager::createTempFile('volcengine_expand_');
        } catch (RuntimeException) {
            throw new InvalidArgumentException('image_generate.create_temp_file_failed');
        }

        try {
            $safeResultUrl = SSRFUtil::getSafeUrl($resultUrl, replaceIp: false);
            $response = $this->createClient()->get($safeResultUrl, [
                RequestOptions::SINK => $tempFile,
            ]);
            if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
                throw new ImageExpandDriverException('Failed to download volcengine expand result image', $response->getStatusCode(), $this->getProviderCode());
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
