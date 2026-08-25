<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\Util\Log\PayloadLogSanitizer;
use App\Infrastructure\Util\SSRF\SSRFUtil;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Hyperf\Codec\Json;
use Hyperf\Guzzle\ClientFactory;
use Hyperf\Logger\LoggerFactory;
use Throwable;

readonly class CloudswayVideoClient
{
    use HasLogger;

    public function __construct(
        private ClientFactory $clientFactory,
        ?LoggerFactory $loggerFactory = null,
    ) {
        if ($loggerFactory !== null) {
            $this->logger = $loggerFactory->get(self::class);
        }
    }

    public function post(string $baseUrl, string $apiKey, string $path, array $payload, array $logContext = []): array
    {
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = '/' . ltrim($path, '/');
        $sanitizedLogContext = PayloadLogSanitizer::sanitizeValue($logContext);
        $this->logger->info('cloudsway video post request', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
            'payload' => PayloadLogSanitizer::sanitizeValue($payload),
        ]);

        try {
            $data = $this->requestJson(
                fn (): array => Json::decode((string) $this->createClient()->post(
                    $normalizedBaseUrl . $normalizedPath,
                    [
                        'headers' => [
                            'Authorization' => 'Bearer ' . $apiKey,
                            'Content-Type' => 'application/json',
                        ],
                        'json' => $payload,
                    ],
                )->getBody()),
                'post',
            );
        } catch (ProviderVideoException $exception) {
            $this->logger->error('cloudsway video post error', [
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }

        $this->logger->info('cloudsway video post response', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
            'response' => PayloadLogSanitizer::sanitizeValue($data),
        ]);

        return $data;
    }

    public function get(string $baseUrl, string $apiKey, string $path, array $logContext = []): array
    {
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = '/' . ltrim($path, '/');
        $sanitizedLogContext = PayloadLogSanitizer::sanitizeValue($logContext);
        $this->logger->info('cloudsway video get request', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
        ]);

        try {
            $data = $this->requestJson(
                fn (): array => Json::decode((string) $this->createClient()->get(
                    $normalizedBaseUrl . $normalizedPath,
                    [
                        'headers' => [
                            'Authorization' => 'Bearer ' . $apiKey,
                            'Content-Type' => 'application/json',
                        ],
                    ],
                )->getBody()),
                'get',
            );
        } catch (ProviderVideoException $exception) {
            $this->logger->error('cloudsway video get error', [
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }

        $this->logger->info('cloudsway video get response', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
            'response' => PayloadLogSanitizer::sanitizeValue($data),
        ]);

        return $data;
    }

    /**
     * @return array{bytes_base64_encoded: string, mime_type: string}
     */
    public function downloadMediaAsBase64(string $url): array
    {
        $safeUrl = SSRFUtil::getSafeUrl($url, replaceIp: false);
        $this->logger->info('cloudsway video media download request', [
            'url' => $safeUrl,
        ]);

        try {
            $response = $this->createClient()->get($safeUrl, [
                'headers' => [
                    'Accept' => '*/*',
                ],
            ]);
        } catch (RequestException $exception) {
            throw ProviderVideoException::retriable(
                $this->formatRequestExceptionMessage($exception, 'download media'),
                $exception,
            );
        } catch (Throwable $throwable) {
            throw ProviderVideoException::retriable(
                sprintf('cloudsway video download media failed: %s', $throwable->getMessage()),
                $throwable,
            );
        }

        $content = (string) $response->getBody();
        if ($content === '') {
            throw ProviderVideoException::retriable('cloudsway video download media failed: empty response body');
        }

        $mimeType = $this->resolveMediaMimeType($response->getHeaderLine('Content-Type'), $safeUrl);
        $result = [
            'bytes_base64_encoded' => base64_encode($content),
            'mime_type' => $mimeType,
        ];

        $this->logger->info('cloudsway video media download response', [
            'url' => $safeUrl,
            'content_length' => strlen($content),
            'mime_type' => $mimeType,
        ]);

        return $result;
    }

    private function createClient(): Client
    {
        return $this->clientFactory->create([
            'timeout' => 30,
            'verify' => false,
        ]);
    }

    private function requestJson(callable $request, string $action): array
    {
        try {
            $data = $request();
        } catch (RequestException $exception) {
            throw ProviderVideoException::retriable(
                $this->formatRequestExceptionMessage($exception, $action),
                $exception,
            );
        } catch (Throwable $throwable) {
            throw ProviderVideoException::retriable(
                sprintf('cloudsway video %s failed: %s', $action, $throwable->getMessage()),
                $throwable,
            );
        }

        if (! is_array($data)) {
            throw ProviderVideoException::retriable(sprintf('cloudsway video %s returned invalid json', $action));
        }

        return $data;
    }

    private function formatRequestExceptionMessage(RequestException $exception, string $action): string
    {
        if (! $exception->hasResponse()) {
            return sprintf('cloudsway video %s failed: %s', $action, $exception->getMessage());
        }

        $response = $exception->getResponse();
        $statusCode = $response?->getStatusCode() ?? 0;
        $reason = $response?->getReasonPhrase() ?? 'unknown';
        $body = trim((string) $response?->getBody());

        if ($body === '') {
            return sprintf('cloudsway video %s failed: HTTP %d %s', $action, $statusCode, $reason);
        }

        $providerMessage = $this->extractProviderMessageFromBody($body);
        return $providerMessage ?? sprintf(
            'cloudsway video %s failed: HTTP %d %s: %s',
            $action,
            $statusCode,
            $reason,
            PayloadLogSanitizer::sanitizeResponseBody($body),
        );
    }

    private function extractProviderMessageFromBody(string $body): ?string
    {
        try {
            $decoded = Json::decode($body);
        } catch (Throwable) {
            return null;
        }

        if (! is_array($decoded)) {
            return null;
        }

        foreach ([
            $decoded['error']['message'] ?? null,
            $decoded['message'] ?? null,
            $decoded['msg'] ?? null,
            is_array($decoded['data'] ?? null) ? ($decoded['data']['message'] ?? null) : null,
            is_array($decoded['data']['error'] ?? null) ? ($decoded['data']['error']['message'] ?? null) : null,
            is_array($decoded['data'] ?? null) ? ($decoded['data']['task_status_msg'] ?? null) : null,
        ] as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return trim($candidate);
            }
        }

        return null;
    }

    private function resolveMediaMimeType(?string $contentType, string $url): string
    {
        $normalizedContentType = trim((string) $contentType);
        if ($normalizedContentType !== '') {
            $normalizedContentType = strtolower(trim(explode(';', $normalizedContentType)[0] ?? ''));
            if ($normalizedContentType !== '') {
                return $normalizedContentType;
            }
        }

        $path = strtolower(parse_url($url, PHP_URL_PATH) ?? '');
        return match (true) {
            str_ends_with($path, '.jpg'), str_ends_with($path, '.jpeg') => 'image/jpeg',
            str_ends_with($path, '.webp') => 'image/webp',
            str_ends_with($path, '.gif') => 'image/gif',
            str_ends_with($path, '.bmp') => 'image/bmp',
            str_ends_with($path, '.avif') => 'image/avif',
            default => 'image/png',
        };
    }
}
