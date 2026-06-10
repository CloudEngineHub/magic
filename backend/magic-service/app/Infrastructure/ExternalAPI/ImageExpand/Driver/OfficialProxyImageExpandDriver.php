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

class OfficialProxyImageExpandDriver implements ImageExpandDriverInterface
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
        return ImageExpandDriverFactory::PROVIDER_OFFICIAL_PROXY;
    }

    public function expand(ImageExpandDriverRequest $request): ImageExpandDriverResponse
    {
        $requestUrl = trim((string) ($this->providerConfig['request_url'] ?? ($this->providerConfig['url'] ?? '')));
        $apiKey = trim((string) ($this->providerConfig['api_key'] ?? ''));
        if ($requestUrl === '' || $apiKey === '') {
            throw new InvalidArgumentException('image_generate.image_expand_provider_not_configured');
        }

        $client = $this->createClient($this->getTimeout());
        $payload = array_filter([
            'image_url' => $request->getImageUrl(),
            'mask_url' => $request->getMaskUrl(),
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
                throw new ImageExpandDriverException('Official proxy provider response format invalid', $response->getStatusCode(), $this->getProviderCode());
            }
            if (! empty($responseData['provider_error_message'])) {
                throw new ImageExpandDriverException(
                    (string) $responseData['provider_error_message'],
                    isset($responseData['provider_error_code']) ? (int) $responseData['provider_error_code'] : $response->getStatusCode(),
                    $this->getProviderCode()
                );
            }

            $resultUrl = (string) ($responseData['data'][0]['url'] ?? '');
            if ($resultUrl === '') {
                throw new ImageExpandDriverException('Official proxy provider missing result url', $response->getStatusCode(), $this->getProviderCode());
            }

            return $this->downloadResultImage($resultUrl);
        } catch (ImageExpandDriverException $exception) {
            throw $exception;
        } catch (Throwable $throwable) {
            $this->logger->error('ImageExpandOfficialProxyException', [
                'error' => $throwable->getMessage(),
                'endpoint' => $requestUrl,
            ]);
            throw new ImageExpandDriverException($throwable->getMessage(), null, $this->getProviderCode());
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

    private function downloadResultImage(string $resultUrl): ImageExpandDriverResponse
    {
        try {
            $tempFile = TemporaryFileManager::createTempFile('official_proxy_expand_');
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
                throw new ImageExpandDriverException('Failed to download official proxy expand result image', $response->getStatusCode(), $this->getProviderCode());
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
