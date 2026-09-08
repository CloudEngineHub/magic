<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini;

use App\ErrorCode\VideoGenerateErrorCode;
use App\Infrastructure\Core\Traits\HasLogger;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoErrorMapper;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use App\Infrastructure\Util\File\TemporaryFileManager;
use App\Infrastructure\Util\Http\GuzzleClientFactory;
use App\Infrastructure\Util\Log\PayloadLogSanitizer;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Hyperf\Codec\Json;
use Hyperf\Logger\LoggerFactory;
use Psr\Http\Message\ResponseInterface;
use Throwable;

readonly class GeminiVideoClient
{
    use HasLogger;

    private const int MEDIA_MAX_BYTES = 104857600;

    public function __construct(
        ?LoggerFactory $loggerFactory = null,
    ) {
        if ($loggerFactory !== null) {
            $this->logger = $loggerFactory->get(self::class);
        }
    }

    public function post(string $baseUrl, string $apiKey, string $path, array $payload, array $logContext = [], string $proxyUrl = ''): array
    {
        return $this->request('post', $baseUrl, $apiKey, $path, $payload, $logContext, $proxyUrl);
    }

    public function get(string $baseUrl, string $apiKey, string $path, array $logContext = [], string $proxyUrl = ''): array
    {
        return $this->request('get', $baseUrl, $apiKey, $path, null, $logContext, $proxyUrl);
    }

    public function downloadMediaToLocalFile(
        string $baseUrl,
        string $apiKey,
        string $uri,
        string $proxyUrl = '',
    ): string {
        $targetPath = TemporaryFileManager::createTempFile('gemini-video-');

        $localStream = null;
        try {
            $response = $this->requestMedia($baseUrl, $apiKey, $uri, $proxyUrl);
            $localStream = fopen($targetPath, 'wb');
            if (! is_resource($localStream)) {
                throw ProviderVideoException::retriable('gemini video media download failed: cannot open target file');
            }
            $body = $response->getBody();
            $downloadedBytes = 0;
            while (! $body->eof()) {
                $chunk = $body->read(8192);
                if ($chunk === '') {
                    continue;
                }
                $downloadedBytes += strlen($chunk);
                if ($downloadedBytes > self::MEDIA_MAX_BYTES) {
                    throw ProviderVideoException::retriable('gemini video media download failed: response exceeds max size');
                }
                if (fwrite($localStream, $chunk) === false) {
                    throw ProviderVideoException::retriable('gemini video media download failed: cannot write target file');
                }
            }
        } catch (Throwable $throwable) {
            @unlink($targetPath);
            throw $throwable;
        } finally {
            if (is_resource($localStream)) {
                fclose($localStream);
            }
        }

        return $targetPath;
    }

    private function requestMedia(string $baseUrl, string $apiKey, string $uri, string $proxyUrl = ''): ResponseInterface
    {
        $url = $this->normalizeMediaUrl($baseUrl, $uri);
        try {
            $response = $this->createClient($proxyUrl)->get($url, [
                'headers' => [
                    'Accept' => '*/*',
                    'x-goog-api-key' => $apiKey,
                ],
                'http_errors' => false,
            ]);
            if ($response->getStatusCode() >= 400) {
                throw ProviderVideoException::retriable(
                    'gemini video media download failed',
                    null,
                    $response->getStatusCode(),
                );
            }

            return $response;
        } catch (RequestException $exception) {
            throw ProviderVideoException::retriable('gemini video media download failed', $exception, $exception->getResponse()?->getStatusCode());
        } catch (ProviderVideoException $exception) {
            throw $exception;
        } catch (Throwable $throwable) {
            throw ProviderVideoException::retriable('gemini video media download failed', $throwable);
        }

        throw ProviderVideoException::retriable('gemini video media download failed');
    }

    private function request(
        string $method,
        string $baseUrl,
        string $apiKey,
        string $path,
        ?array $payload,
        array $logContext,
        string $proxyUrl,
    ): array {
        $normalizedBaseUrl = rtrim($baseUrl, '/');
        $normalizedPath = $path === '' ? '' : '/' . ltrim($path, '/');
        $sanitizedLogContext = PayloadLogSanitizer::sanitizeValue($logContext);

        $this->logger->info('gemini video request', [
            'method' => $method,
            'base_url' => $normalizedBaseUrl,
            'path' => $normalizedPath,
            'context' => $sanitizedLogContext,
            'payload' => $payload === null ? null : PayloadLogSanitizer::sanitizeValue($payload),
        ]);

        try {
            $response = $this->send($method, $normalizedBaseUrl . $normalizedPath, $apiKey, $payload, $proxyUrl);
            $body = (string) $response->getBody();
            if (trim($body) === '') {
                throw $this->responseFormatException();
            }

            try {
                $data = Json::decode($body);
            } catch (Throwable $throwable) {
                throw $this->responseFormatException($throwable);
            }

            if (! is_array($data)) {
                throw $this->responseFormatException();
            }

            $this->logger->info('gemini video response', [
                'http_status' => $response->getStatusCode(),
                'response' => PayloadLogSanitizer::sanitizeValue($data),
            ]);

            return $data;
        } catch (ProviderVideoException $exception) {
            $this->logger->error('gemini video error', [
                'http_status' => $exception->getHttpStatus(),
                'error_code' => $exception->getErrorCode(),
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        } catch (RequestException $exception) {
            $response = $exception->getResponse();
            $httpStatus = $exception->getResponse()?->getStatusCode();
            $responseBody = $response === null ? null : (string) $response->getBody();
            if ($response?->getBody()->isSeekable()) {
                $response->getBody()->rewind();
            }
            $providerCode = $this->extractProviderCode($responseBody);
            $errorCode = ProviderVideoErrorMapper::resolve($providerCode, $httpStatus);
            $factory = ProviderVideoErrorMapper::isRetriable($httpStatus, ! $exception->hasResponse(), $errorCode) ? 'retriable' : 'nonRetriable';
            $this->logger->error('gemini video request failed', [
                'response' => $responseBody === null ? null : PayloadLogSanitizer::sanitizeResponseBody($responseBody),
                'provider_error_code' => $providerCode,
                'http_status' => $httpStatus,
                'error_message' => $exception->getMessage(),
            ]);
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
    }

    private function send(string $method, string $url, string $apiKey, ?array $payload, string $proxyUrl): ResponseInterface
    {
        $options = [
            'headers' => [
                'x-goog-api-key' => $apiKey,
                'Content-Type' => 'application/json',
            ],
        ];
        if ($payload !== null) {
            $options['json'] = $payload;
        }

        return $this->createClient($proxyUrl)->{$method}($url, $options);
    }

    private function createClient(string $proxyUrl = ''): Client
    {
        return GuzzleClientFactory::createProxyClient([], $proxyUrl);
    }

    private function normalizeMediaUrl(string $baseUrl, string $uri): string
    {
        $uri = trim($uri);
        if (preg_match('#^https?://#i', $uri) === 1) {
            return $uri;
        }
        return rtrim($baseUrl, '/') . '/' . ltrim($uri, '/');
    }

    private function responseFormatException(?Throwable $previous = null): ProviderVideoException
    {
        return ProviderVideoException::retriable(
            ProviderVideoErrorMapper::message(VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR),
            $previous,
            null,
            (string) VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR->value,
        );
    }

    private function extractProviderCode(?string $responseBody): null|int|string
    {
        if ($responseBody === null || trim($responseBody) === '') {
            return null;
        }

        try {
            $data = Json::decode($responseBody);
        } catch (Throwable) {
            return null;
        }

        if (! is_array($data)) {
            return null;
        }

        $error = $data['error'] ?? null;
        if (is_array($error) && (is_string($error['code'] ?? null) || is_int($error['code'] ?? null))) {
            return $error['code'];
        }

        return is_string($data['code'] ?? null) || is_int($data['code'] ?? null) ? $data['code'] : null;
    }
}
