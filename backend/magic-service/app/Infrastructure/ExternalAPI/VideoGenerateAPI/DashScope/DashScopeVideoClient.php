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
                'post',
            );
        } catch (ProviderVideoException $exception) {
            $this->logger->error('dashscope video post error', [
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }

        $this->logger->info('dashscope video post response', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
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
                'get',
            );
        } catch (ProviderVideoException $exception) {
            $this->logger->error('dashscope video get error', [
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }

        $this->logger->info('dashscope video get response', [
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
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

    private function requestJson(callable $request, string $action): array
    {
        try {
            $data = $request();
        } catch (RequestException $exception) {
            $httpStatus = $exception->getResponse()?->getStatusCode();
            $providerCode = $this->extractProviderCodeFromResponse($exception);
            $errorCode = ProviderVideoErrorMapper::resolve($providerCode, $httpStatus);
            $retriable = ProviderVideoErrorMapper::isRetriable($httpStatus, ! $exception->hasResponse(), $errorCode);
            $factory = $retriable ? 'retriable' : 'nonRetriable';
            throw ProviderVideoException::$factory(
                ProviderVideoErrorMapper::message($errorCode, null, $providerCode),
                $exception,
                $httpStatus,
                (string) $errorCode->value,
            );
        } catch (Throwable $throwable) {
            throw ProviderVideoException::retriable(
                ProviderVideoErrorMapper::message(VideoGenerateErrorCode::GENERAL_ERROR),
                $throwable,
                null,
                (string) VideoGenerateErrorCode::GENERAL_ERROR->value,
            );
        }

        if (! is_array($data)) {
            throw ProviderVideoException::retriable(
                ProviderVideoErrorMapper::message(VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR),
                null,
                null,
                (string) VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR->value,
            );
        }

        $this->assertProviderSuccess($data, $action);

        return $data;
    }

    private function assertProviderSuccess(array $data, string $action): void
    {
        if (! array_key_exists('code', $data)) {
            return;
        }

        $code = $data['code'];
        if ($code === 0 || $code === '0' || $code === null || $code === '') {
            return;
        }

        $errorCode = ProviderVideoErrorMapper::resolve($this->extractProviderCode($data));
        $factory = $errorCode === VideoGenerateErrorCode::RATE_LIMITED ? 'retriable' : 'nonRetriable';
        throw ProviderVideoException::$factory(
            ProviderVideoErrorMapper::message($errorCode, null, $this->extractProviderCode($data)),
            null,
            null,
            (string) $errorCode->value,
        );
    }

    private function extractProviderCodeFromResponse(RequestException $exception): null|int|string
    {
        $response = $exception->getResponse();
        if ($response === null) {
            return null;
        }
        return $this->extractProviderCodeFromBody((string) $response->getBody());
    }

    private function extractProviderCodeFromBody(string $body): null|int|string
    {
        try {
            $decoded = Json::decode($body);
        } catch (Throwable) {
            return null;
        }

        if (! is_array($decoded)) {
            return null;
        }

        return $this->extractProviderCode($decoded);
    }

    private function extractProviderCode(array $data): null|int|string
    {
        foreach ([
            $data['code'] ?? null,
            is_array($data['error'] ?? null) ? ($data['error']['code'] ?? null) : null,
            is_array($data['output'] ?? null) ? ($data['output']['code'] ?? null) : null,
        ] as $candidate) {
            if (is_string($candidate) || is_int($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}
