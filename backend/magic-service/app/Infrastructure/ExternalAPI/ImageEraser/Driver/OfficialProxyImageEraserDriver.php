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

class OfficialProxyImageEraserDriver implements ImageEraserDriverInterface
{
    private LoggerInterface $logger;

    /**
     * @param array<string, mixed> $providerConfig
     */
    public function __construct(
        private readonly array $providerConfig,
        private readonly ImageFileInspector $imageFileInspector,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get(static::class);
    }

    public function getProviderCode(): string
    {
        return ImageEraserDriverFactory::PROVIDER_OFFICIAL_PROXY;
    }

    public function erase(ImageEraserDriverRequest $request): ImageEraserDriverResponse
    {
        $requestUrl = trim((string) ($this->providerConfig['url'] ?? ''));
        $apiKey = trim((string) ($this->providerConfig['api_key'] ?? ''));
        if ($requestUrl === '' || $apiKey === '') {
            throw new InvalidArgumentException('image_generate.image_eraser_provider_not_configured');
        }

        $client = $this->createClient($this->getTimeout());
        $payload = array_filter([
            'image_url' => $request->getImageUrl(),
            'mask_url' => $request->getMaskUrl(),
            'steps' => $request->getSteps(),
            'strength' => $request->getStrength(),
            'seed' => $request->getSeed(),
            'dilate_size' => $request->getDilateSize(),
            'quality' => $request->getQuality(),
        ], static fn ($value) => $value !== null && $value !== '');

        try {
            $response = $client->post($requestUrl, [
                RequestOptions::HEADERS => [
                    'Authorization' => 'Bearer ' . $apiKey,
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                ],
                RequestOptions::JSON => $payload,
            ]);

            $responseData = json_decode((string) $response->getBody(), true);
            if (! is_array($responseData)) {
                throw new ImageEraserDriverException('Official proxy provider response format invalid', $response->getStatusCode(), $this->getProviderCode());
            }
            if (! empty($responseData['provider_error_message'])) {
                throw new ImageEraserDriverException(
                    (string) $responseData['provider_error_message'],
                    isset($responseData['provider_error_code']) ? (int) $responseData['provider_error_code'] : $response->getStatusCode(),
                    $this->getProviderCode()
                );
            }

            $resultUrl = (string) ($responseData['data'][0]['url'] ?? '');
            if ($resultUrl === '') {
                throw new ImageEraserDriverException('Official proxy provider missing result url', $response->getStatusCode(), $this->getProviderCode());
            }

            return $this->downloadResultImage($resultUrl);
        } catch (ImageEraserDriverException $exception) {
            throw $exception;
        } catch (Throwable $throwable) {
            $this->logger->error('ImageEraserOfficialProxyException', [
                'error' => $throwable->getMessage(),
                'endpoint' => $requestUrl,
            ]);
            throw new ImageEraserDriverException($throwable->getMessage(), null, $this->getProviderCode());
        }
    }

    private function getTimeout(): int
    {
        return (int) ($this->providerConfig['timeout'] ?? 300);
    }

    private function createClient(int $timeout): Client
    {
        return GuzzleClientFactory::createProxyClient([
            RequestOptions::TIMEOUT => $timeout,
            'http_errors' => false,
        ]);
    }

    private function downloadResultImage(string $resultUrl): ImageEraserDriverResponse
    {
        try {
            $tempFile = TemporaryFileManager::createTempFile('official_proxy_eraser_');
        } catch (RuntimeException) {
            throw new InvalidArgumentException('image_generate.create_temp_file_failed');
        }

        try {
            $client = $this->createClient($this->getTimeout());
            $safeResultUrl = SSRFUtil::getSafeUrl($resultUrl, replaceIp: false);
            $response = $client->get($safeResultUrl, [
                RequestOptions::SINK => $tempFile,
            ]);

            if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
                throw new ImageEraserDriverException('Failed to download official proxy eraser result image', $response->getStatusCode(), $this->getProviderCode());
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
