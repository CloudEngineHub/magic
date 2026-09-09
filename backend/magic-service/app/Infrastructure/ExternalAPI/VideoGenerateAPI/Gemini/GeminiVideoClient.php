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
                throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage());
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
                    throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage());
                }
                if (fwrite($localStream, $chunk) === false) {
                    throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage());
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
                throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage());
            }

            return $response;
        } catch (RequestException $exception) {
            throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage(), $exception);
        } catch (ProviderVideoException $exception) {
            throw $exception;
        } catch (Throwable $throwable) {
            throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage(), $throwable);
        }

        throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage());
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
            $errorCode = ProviderVideoErrorMapper::resolveGemini($exception);
            $this->logger->error('gemini video request failed', [
                'response' => $responseBody === null ? null : PayloadLogSanitizer::sanitizeResponseBody($responseBody),
                'error_code' => $errorCode->value,
                'http_status' => $httpStatus,
                'error_message' => $exception->getMessage(),
            ]);
            throw new ProviderVideoException(
                $errorCode,
                $errorCode->getMessage(),
                $exception,
            );
        } catch (Throwable $throwable) {
            throw new ProviderVideoException(VideoGenerateErrorCode::GENERAL_ERROR, VideoGenerateErrorCode::GENERAL_ERROR->getMessage(), $throwable);
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
        return new ProviderVideoException(VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR, VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR->getMessage(), $previous);
    }
}
