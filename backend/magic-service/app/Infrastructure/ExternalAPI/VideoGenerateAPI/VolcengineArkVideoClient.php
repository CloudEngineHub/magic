<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\ErrorCode\VideoGenerateErrorCode;
use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\Util\Log\PayloadLogSanitizer;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Hyperf\Codec\Json;
use Hyperf\Contract\TranslatorInterface;
use Hyperf\Guzzle\ClientFactory;
use Hyperf\Logger\LoggerFactory;
use Throwable;

readonly class VolcengineArkVideoClient
{
    use HasLogger;

    // Seedance 任务创建在高峰期可能长时间挂起，请求超时放宽到 180 秒避免 30 秒过早中断。
    private const int REQUEST_TIMEOUT_SECONDS = 180;

    public function __construct(
        private ClientFactory $clientFactory,
        ?LoggerFactory $loggerFactory = null,
        private ?TranslatorInterface $translator = null,
    ) {
        if ($loggerFactory !== null) {
            $this->logger = $loggerFactory->get(self::class);
        }
    }

    public function post(string $baseUrl, string $apiKey, string $path, array $payload, array $logContext = []): array
    {
        return $this->handleRequestException(
            fn () => $this->requestJson(
                'post',
                $baseUrl,
                $apiKey,
                $path,
                ['json' => $payload],
                $logContext,
            ),
            'post',
            $baseUrl,
            $path,
            $logContext,
        );
    }

    public function get(string $baseUrl, string $apiKey, string $path, array $logContext = []): array
    {
        return $this->handleRequestException(
            fn () => $this->requestJson(
                'get',
                $baseUrl,
                $apiKey,
                $path,
                [],
                $logContext,
            ),
            'get',
            $baseUrl,
            $path,
            $logContext,
        );
    }

    public function requestJson(
        string $method,
        string $baseUrl,
        string $apiKey,
        string $path,
        array $options,
        array $logContext,
    ): array {
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = '/' . ltrim($path, '/');
        $startedAt = microtime(true);
        $sanitizedLogContext = PayloadLogSanitizer::sanitizeValue($logContext);

        $this->logger->info('volcengine ark video request', [
            'method' => $method,
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
            'payload' => is_array($options['json'] ?? null) ? PayloadLogSanitizer::sanitizeValue($options['json']) : null,
        ]);

        $requestOptions = array_merge([
            'headers' => [
                'Authorization' => 'Bearer ' . $apiKey,
                'Content-Type' => 'application/json',
            ],
        ], $options);
        $response = match ($method) {
            'post' => $this->createClient()->post($normalizedBaseUrl . $normalizedPath, $requestOptions),
            'get' => $this->createClient()->get($normalizedBaseUrl . $normalizedPath, $requestOptions),
            default => throw ProviderVideoException::nonRetriable(sprintf('unsupported volcengine ark video method %s', $method)),
        };
        $data = Json::decode((string) $response->getBody());

        $this->logger->info('volcengine ark video response', [
            'method' => $method,
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
            'http_status' => $response->getStatusCode(),
            'provider_request_id' => $response->getHeaderLine('x-tt-logid'),
            'elapsed_ms' => $this->calculateElapsedMilliseconds($startedAt),
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

    private function handleRequestException(
        callable $request,
        string $method,
        string $baseUrl,
        string $path,
        array $logContext,
    ): array {
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = '/' . ltrim($path, '/');
        $startedAt = microtime(true);
        $sanitizedLogContext = PayloadLogSanitizer::sanitizeValue($logContext);

        try {
            return $request();
        } catch (RequestException $exception) {
            $response = $exception->getResponse();
            $responseBody = $response?->getBody();
            $errorMessage = $responseBody !== null ? (string) $responseBody : $exception->getMessage();
            if ($responseBody?->isSeekable()) {
                $responseBody->rewind();
            }
            $httpStatus = $response?->getStatusCode();
            $this->logger->error('volcengine ark video error', [
                'method' => $method,
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'http_status' => $httpStatus,
                'elapsed_ms' => $this->calculateElapsedMilliseconds($startedAt),
                'error' => $errorMessage,
            ]);
            $providerCode = $this->extractProviderCode($errorMessage);
            $errorCode = ProviderVideoErrorMapper::resolve($providerCode, $httpStatus);
            $isRetriable = ProviderVideoErrorMapper::isRetriable($httpStatus, ! $exception->hasResponse(), $errorCode)
                || in_array($httpStatus, [408, 409], true);
            $factory = $isRetriable ? 'retriable' : 'nonRetriable';
            throw ProviderVideoException::$factory(
                ProviderVideoErrorMapper::message($errorCode, $this->translator, $providerCode),
                $exception,
                $httpStatus,
                (string) $errorCode->value,
            );
        } catch (ProviderVideoException $exception) {
            throw $exception;
        } catch (Throwable $throwable) {
            $this->logger->error('volcengine ark video error', [
                'method' => $method,
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'http_status' => null,
                'provider_request_id' => null,
                'elapsed_ms' => $this->calculateElapsedMilliseconds($startedAt),
                'error' => sprintf('volcengine ark video %s failed: %s', $method, $throwable->getMessage()),
            ]);
            throw ProviderVideoException::retriable(
                ProviderVideoErrorMapper::message(VideoGenerateErrorCode::GENERAL_ERROR, $this->translator),
                $throwable,
                null,
                (string) VideoGenerateErrorCode::GENERAL_ERROR->value,
            );
        }
    }

    private function calculateElapsedMilliseconds(float $startedAt): int
    {
        return max(0, (int) round((microtime(true) - $startedAt) * 1000));
    }

    private function extractProviderCode(string $errorContent): null|int|string
    {
        try {
            $payload = Json::decode(trim($errorContent));
            if (is_array($payload)) {
                $error = is_array($payload['error'] ?? null) ? $payload['error'] : [];
                return is_string($error['code'] ?? null) || is_int($error['code'] ?? null) ? $error['code'] : null;
            }
        } catch (Throwable) {
        }

        return null;
    }

}
