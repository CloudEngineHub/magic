<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\MiniMax;

use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use App\Infrastructure\Util\Log\PayloadLogSanitizer;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Hyperf\Codec\Json;
use Hyperf\Guzzle\ClientFactory;
use Hyperf\Logger\LoggerFactory;
use Throwable;

readonly class MiniMaxVideoClient
{
    use HasLogger;

    private const int REQUEST_TIMEOUT_SECONDS = 180;

    private const array NON_RETRIABLE_HTTP_STATUSES = [400, 401, 402, 422];

    public function __construct(
        private ClientFactory $clientFactory,
        ?LoggerFactory $loggerFactory = null,
    ) {
        if ($loggerFactory !== null) {
            $this->logger = $loggerFactory->get(self::class);
        }
    }

    public function request(
        string $method,
        string $baseUrl,
        string $apiKey,
        string $path,
        array $payload = [],
    ): array {
        $normalizedMethod = strtolower($method);
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = '/' . ltrim($path, '/');

        $this->logger->info('minimax video request', [
            'method' => $normalizedMethod,
            'path' => $normalizedPath,
            'payload' => PayloadLogSanitizer::sanitizeValue($payload),
        ]);

        try {
            $options = [
                'headers' => ['Authorization' => 'Bearer ' . $apiKey],
            ];
            if ($normalizedMethod === 'get') {
                if ($payload !== []) {
                    $options['query'] = $payload;
                }
            } else {
                $options['headers']['Content-Type'] = 'application/json';
                $options['json'] = $payload;
            }

            $response = $this->createClient()->request(
                $method,
                $normalizedBaseUrl . $normalizedPath,
                $options,
            );
            $data = Json::decode((string) $response->getBody());
        } catch (RequestException $exception) {
            $errorResponse = $exception->getResponse();
            $body = (string) $errorResponse?->getBody();
            $this->logger->error('minimax video error', [
                'method' => $normalizedMethod,
                'path' => $normalizedPath,
                'http_status' => $errorResponse?->getStatusCode(),
                'error' => $body === '' ? $exception->getMessage() : $body,
            ]);
            $message = $body === '' ? $exception->getMessage() : $body;
            throw $this->createHttpStatusException(
                'MiniMax video request failed: ' . substr($message, 0, 1024),
                $errorResponse?->getStatusCode(),
                $exception,
            );
        } catch (Throwable $exception) {
            $this->logger->error('minimax video error', [
                'method' => $normalizedMethod,
                'path' => $normalizedPath,
                'http_status' => null,
                'error' => $exception->getMessage(),
            ]);
            throw ProviderVideoException::retriable('MiniMax video request failed: ' . $exception->getMessage(), $exception);
        }

        if (! is_array($data)) {
            $this->logger->error('minimax video error', [
                'method' => $normalizedMethod,
                'path' => $normalizedPath,
                'http_status' => $response->getStatusCode(),
                'error' => 'MiniMax video returned invalid json',
            ]);
            throw ProviderVideoException::retriable('MiniMax video returned invalid json');
        }

        $this->logger->info('minimax video response', [
            'method' => $normalizedMethod,
            'path' => $normalizedPath,
            'http_status' => $response->getStatusCode(),
            'provider_request_id' => $this->resolveProviderRequestId($data, $response->getHeaderLine('x-request-id')),
            'response' => PayloadLogSanitizer::sanitizeValue($data),
        ]);

        return $data;
    }

    private function createClient(): Client
    {
        return $this->clientFactory->create([
            'timeout' => self::REQUEST_TIMEOUT_SECONDS,
        ]);
    }

    private function resolveProviderRequestId(array $data, string $headerRequestId): ?string
    {
        $baseResponse = is_array($data['base_resp'] ?? null) ? $data['base_resp'] : [];
        foreach ([$headerRequestId, $data['request_id'] ?? null, $baseResponse['request_id'] ?? null] as $requestId) {
            $normalizedRequestId = trim((string) $requestId);
            if ($normalizedRequestId !== '') {
                return $normalizedRequestId;
            }
        }

        return null;
    }

    private function createHttpStatusException(
        string $message,
        ?int $httpStatus,
        Throwable $previous,
    ): ProviderVideoException {
        if (in_array($httpStatus, self::NON_RETRIABLE_HTTP_STATUSES, true)) {
            return ProviderVideoException::nonRetriable($message, $previous, $httpStatus);
        }

        return ProviderVideoException::retriable($message, $previous, $httpStatus);
    }
}
