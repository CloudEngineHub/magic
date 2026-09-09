<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope;

use App\ErrorCode\VideoGenerateErrorCode;
use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoErrorMapper;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use App\Infrastructure\Util\Log\PayloadLogSanitizer;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Hyperf\Codec\Json;
use Hyperf\Guzzle\ClientFactory;
use Hyperf\Logger\LoggerFactory;
use Throwable;

readonly class DashScopeVideoClient
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

    public function post(string $baseUrl, string $apiKey, string $path, array $payload, array $logContext = [], string $proxyUrl = ''): array
    {
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = '/' . ltrim($path, '/');
        $sanitizedLogContext = PayloadLogSanitizer::sanitizeValue($logContext);
        $this->logger->info('dashscope video post request', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
            'payload' => PayloadLogSanitizer::sanitizeValue($payload),
        ]);

        try {
            $data = $this->requestJson(
                fn (): array => Json::decode((string) $this->createClient($proxyUrl)->post(
                    $normalizedBaseUrl . $normalizedPath,
                    [
                        'headers' => [
                            'Authorization' => 'Bearer ' . $apiKey,
                            'Content-Type' => 'application/json',
                            'X-DashScope-Async' => 'enable',
                        ],
                        'json' => $payload,
                    ],
                )->getBody()),
            );
        } catch (ProviderVideoException $exception) {
            $this->logger->error('dashscope video post error', [
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }

        $this->logger->info('dashscope video post response', [
            'response' => PayloadLogSanitizer::sanitizeValue($data),
        ]);

        return $data;
    }

    public function get(string $baseUrl, string $apiKey, string $path, array $logContext = [], string $proxyUrl = ''): array
    {
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = '/' . ltrim($path, '/');
        $sanitizedLogContext = PayloadLogSanitizer::sanitizeValue($logContext);
        $this->logger->info('dashscope video get request', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
        ]);

        try {
            $data = $this->requestJson(
                fn (): array => Json::decode((string) $this->createClient($proxyUrl)->get(
                    $normalizedBaseUrl . $normalizedPath,
                    [
                        'headers' => [
                            'Authorization' => 'Bearer ' . $apiKey,
                            'Content-Type' => 'application/json',
                        ],
                    ],
                )->getBody()),
            );
        } catch (ProviderVideoException $exception) {
            $this->logger->error('dashscope video get error', [
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }

        $this->logger->info('dashscope video get response', [
            'response' => PayloadLogSanitizer::sanitizeValue($data),
        ]);

        return $data;
    }

    private function createClient(string $proxyUrl = ''): Client
    {
        $options = [
            'timeout' => 30,
            'verify' => false,
        ];
        if ($proxyUrl !== '') {
            $options['proxy'] = $proxyUrl;
        }
        return $this->clientFactory->create($options);
    }

    private function requestJson(callable $request): array
    {
        try {
            $data = $request();
        } catch (RequestException $exception) {
            $httpStatus = $exception->getResponse()?->getStatusCode();
            $errorCode = ProviderVideoErrorMapper::resolveDashScope($exception);
            $retriable = ProviderVideoErrorMapper::isRetriable($exception, $errorCode);
            $factory = $retriable ? 'retriable' : 'nonRetriable';
            throw ProviderVideoException::$factory(
                $errorCode->getMessage(),
                $exception,
                $httpStatus,
                (string) $errorCode->value,
            );
        } catch (Throwable $throwable) {
            throw ProviderVideoException::retriable(
                VideoGenerateErrorCode::GENERAL_ERROR->getMessage(),
                $throwable,
                null,
                (string) VideoGenerateErrorCode::GENERAL_ERROR->value,
            );
        }

        if (! is_array($data)) {
            throw ProviderVideoException::retriable(
                VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR->getMessage(),
                null,
                null,
                (string) VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR->value,
            );
        }

        $this->assertProviderSuccess($data);

        return $data;
    }

    private function assertProviderSuccess(array $data): void
    {
        $output = is_array($data['output'] ?? null) ? $data['output'] : [];
        $error = is_array($data['error'] ?? null) ? $data['error'] : [];
        $outputError = is_array($output['error'] ?? null) ? $output['error'] : [];
        $code = $data['code'] ?? $error['code'] ?? $output['code'] ?? $outputError['code'] ?? null;
        if ($code === null) {
            return;
        }
        if ($code === 0 || $code === '0' || $code === null || $code === '') {
            return;
        }

        $errorCode = ProviderVideoErrorMapper::resolveDashScope(null, $data);
        $factory = $this->isTransientBusinessError($data) ? 'retriable' : 'nonRetriable';
        throw ProviderVideoException::$factory(
            $errorCode->getMessage(),
            null,
            null,
            (string) $errorCode->value,
        );
    }

    private function isTransientBusinessError(array $data): bool
    {
        $output = is_array($data['output'] ?? null) ? $data['output'] : [];
        $error = is_array($data['error'] ?? null) ? $data['error'] : [];
        $outputError = is_array($output['error'] ?? null) ? $output['error'] : [];
        $code = strtolower((string) ($data['code'] ?? $error['code'] ?? $output['code'] ?? $outputError['code'] ?? ''));

        return str_contains($code, 'throttl')
            || str_contains($code, 'ratelimit')
            || str_contains($code, 'serviceunavailable')
            || str_contains($code, 'internalerror');
    }
}
