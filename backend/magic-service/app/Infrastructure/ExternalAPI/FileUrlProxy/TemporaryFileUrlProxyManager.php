<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\FileUrlProxy;

use App\Infrastructure\Util\Http\GuzzleClientFactory;
use GuzzleHttp\ClientInterface;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;
use RuntimeException;
use Throwable;

class TemporaryFileUrlProxyManager
{
    private const REQUEST_TIMEOUT = 30;

    private string $proxyBaseUrl;

    private ?ClientInterface $client;

    private LoggerInterface $logger;

    public function __construct(
        ?string $proxyBaseUrl = null,
        ?ClientInterface $client = null,
        ?LoggerInterface $logger = null
    ) {
        $this->proxyBaseUrl = $this->normalizeProxyBaseUrl($proxyBaseUrl ?? $this->resolveProxyBaseUrl());
        $this->client = $client;
        $this->logger = $logger ?? $this->resolveLogger();
    }

    /**
     * @return array{urls: array, proxy_urls: array<int, string>}
     */
    public function prepare(array $fileUrls): array
    {
        if ($this->proxyBaseUrl === '') {
            return [
                'urls' => $fileUrls,
                'proxy_urls' => [],
            ];
        }

        $urls = [];
        $proxyUrls = [];

        try {
            foreach ($fileUrls as $key => $fileUrl) {
                if (! is_string($fileUrl) || ! $this->shouldProxy($fileUrl)) {
                    $urls[$key] = $fileUrl;
                    continue;
                }

                $createUrl = $this->buildCreateUrl($fileUrl);
                if (! isset($proxyUrls[$createUrl])) {
                    $proxyUrls[$createUrl] = $this->createProxy($createUrl);
                }
                $urls[$key] = $proxyUrls[$createUrl];
            }
        } catch (Throwable $throwable) {
            $createdProxyUrls = array_values($proxyUrls);
            $this->cleanup($createdProxyUrls);
            $this->logger->warning('Temporary file URL proxy prepare failed, fallback to original URLs', [
                'created_proxy_count' => count($createdProxyUrls),
                'created_proxy_url_sha256' => array_map(static fn (string $proxyUrl): string => hash('sha256', $proxyUrl), $createdProxyUrls),
                'error_class' => $throwable::class,
                'error_code' => $throwable->getCode(),
                'error' => $this->sanitizeErrorMessage($throwable->getMessage()),
            ]);

            return [
                'urls' => $fileUrls,
                'proxy_urls' => [],
            ];
        }

        return [
            'urls' => $urls,
            'proxy_urls' => array_values($proxyUrls),
        ];
    }

    public function cleanup(array $proxyUrls): void
    {
        foreach (array_unique($proxyUrls) as $proxyUrl) {
            if (! is_string($proxyUrl) || $proxyUrl === '') {
                continue;
            }

            try {
                $this->deleteProxy($proxyUrl);
            } catch (Throwable $throwable) {
                $this->logger->warning('Temporary file URL proxy cleanup failed', [
                    'proxy_url' => $proxyUrl,
                    'error' => $this->sanitizeErrorMessage($throwable->getMessage()),
                ]);
            }
        }
    }

    private function shouldProxy(string $fileUrl): bool
    {
        if ($fileUrl === '') {
            return false;
        }

        if (str_starts_with($fileUrl, $this->proxyBaseUrl . '/')) {
            return false;
        }

        return $this->isHttpUrl($fileUrl);
    }

    private function buildCreateUrl(string $fileUrl): string
    {
        return $this->proxyBaseUrl . '/' . $fileUrl;
    }

    private function createProxy(string $createUrl): string
    {
        $response = $this->getClient()->request('PUT', $createUrl, [
            'http_errors' => false,
        ]);

        $statusCode = $response->getStatusCode();
        if ($statusCode < 200 || $statusCode >= 300) {
            throw new RuntimeException('Temporary file URL proxy create failed, status: ' . $statusCode);
        }

        $proxyUrl = trim((string) $response->getBody());
        if (! $this->isHttpUrl($proxyUrl)) {
            throw new RuntimeException('Temporary file URL proxy create failed, invalid response URL');
        }

        return $proxyUrl;
    }

    private function isHttpUrl(string $url): bool
    {
        return preg_match('#^https?://#i', $url) === 1;
    }

    private function deleteProxy(string $proxyUrl): void
    {
        $response = $this->getClient()->request('DELETE', $proxyUrl, [
            'http_errors' => false,
        ]);

        $statusCode = $response->getStatusCode();
        if ($statusCode < 200 || $statusCode >= 300) {
            throw new RuntimeException('Temporary file URL proxy delete failed, status: ' . $statusCode);
        }
    }

    private function getClient(): ClientInterface
    {
        if ($this->client === null) {
            $this->client = GuzzleClientFactory::createProxyClient([
                'timeout' => self::REQUEST_TIMEOUT,
                'http_errors' => false,
            ]);
        }

        return $this->client;
    }

    private function resolveProxyBaseUrl(): string
    {
        try {
            return (string) config('file_url_proxy.base_url', env('TEMPORARY_FILE_URL_PROXY_BASE_URL', ''));
        } catch (Throwable) {
            return (string) env('TEMPORARY_FILE_URL_PROXY_BASE_URL', '');
        }
    }

    private function normalizeProxyBaseUrl(string $proxyBaseUrl): string
    {
        return rtrim(trim($proxyBaseUrl), '/');
    }

    private function sanitizeErrorMessage(string $message): string
    {
        return preg_replace('#https?://\S+#i', '[url]', $message) ?? $message;
    }

    private function resolveLogger(): LoggerInterface
    {
        try {
            return di(LoggerFactory::class)->get(self::class);
        } catch (Throwable) {
            return new NullLogger();
        }
    }
}
