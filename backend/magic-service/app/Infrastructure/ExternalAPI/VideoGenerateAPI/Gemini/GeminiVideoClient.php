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
use App\Infrastructure\Util\Log\PayloadLogSanitizer;
use App\Infrastructure\Util\SSRF\SSRFUtil;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Hyperf\Codec\Json;
use Hyperf\Guzzle\ClientFactory;
use Hyperf\Logger\LoggerFactory;
use Psr\Http\Message\ResponseInterface;
use Throwable;

readonly class GeminiVideoClient
{
    use HasLogger;

    private const int REQUEST_TIMEOUT_SECONDS = 30;

    private const int MEDIA_MAX_BYTES = 104857600;

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
        return $this->request('post', $baseUrl, $apiKey, $path, $payload, $logContext);
    }

    public function get(string $baseUrl, string $apiKey, string $path, array $logContext = []): array
    {
        return $this->request('get', $baseUrl, $apiKey, $path, null, $logContext);
    }

    /** @return array{bytes_base64_encoded: string, mime_type: string} */
    public function downloadMedia(string $baseUrl, string $apiKey, string $uri, array $logContext = []): array
    {
        $url = $this->normalizeMediaUrl($baseUrl, $uri);
        try {
            $client = $this->createClient();
            $safeUrl = SSRFUtil::getSafeUrl($url, replaceIp: false, allowRedirect: false);
            for ($redirect = 0; $redirect <= 3; ++$redirect) {
                $sameOrigin = $this->sameOrigin($url, $safeUrl);
                $headers = ['Accept' => '*/*'];
                if ($sameOrigin) {
                    $headers['x-goog-api-key'] = $apiKey;
                }
                $response = $client->get($safeUrl, [
                    'headers' => $headers,
                    'allow_redirects' => false,
                    'http_errors' => false,
                ]);
                $status = $response->getStatusCode();
                if ($status >= 400) {
                    throw ProviderVideoException::retriable('gemini video media download failed', null, $status);
                }
                if ($status < 300) {
                    break;
                }
                $location = trim($response->getHeaderLine('Location'));
                if ($location === '') {
                    throw ProviderVideoException::retriable('gemini video media download failed: redirect location missing');
                }
                if ($redirect === 3) {
                    throw ProviderVideoException::retriable('gemini video media download failed: redirect limit exceeded');
                }
                $redirectUrl = (string) UriResolver::resolve(new Uri($safeUrl), new Uri($location));
                $safeUrl = SSRFUtil::getSafeUrl($redirectUrl, replaceIp: false, allowRedirect: false);
            }
        } catch (RequestException $exception) {
            throw ProviderVideoException::retriable('gemini video media download failed', $exception, $exception->getResponse()?->getStatusCode());
        } catch (ProviderVideoException $exception) {
            throw $exception;
        } catch (Throwable $throwable) {
            throw ProviderVideoException::retriable('gemini video media download failed', $throwable);
        }

        $chunks = [];
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
            $chunks[] = $chunk;
        }
        $content = implode('', $chunks);
        if ($content === '') {
            throw ProviderVideoException::retriable('gemini video media download failed: empty response body');
        }

        $mimeType = trim((string) explode(';', $response->getHeaderLine('Content-Type'), 2)[0]);
        if ($mimeType === '' || ! str_starts_with(strtolower($mimeType), 'video/')) {
            $mimeType = 'video/mp4';
        }

        return ['bytes_base64_encoded' => base64_encode($content), 'mime_type' => $mimeType];
    }

    private function sameOrigin(string $first, string $second): bool
    {
        $firstParts = parse_url($first);
        $secondParts = parse_url($second);
        if (! is_array($firstParts) || ! is_array($secondParts)) {
            return false;
        }
        $firstScheme = strtolower((string) ($firstParts['scheme'] ?? ''));
        $secondScheme = strtolower((string) ($secondParts['scheme'] ?? ''));
        $firstHost = strtolower((string) ($firstParts['host'] ?? ''));
        $secondHost = strtolower((string) ($secondParts['host'] ?? ''));
        $firstPort = (int) ($firstParts['port'] ?? ($firstScheme === 'https' ? 443 : 80));
        $secondPort = (int) ($secondParts['port'] ?? ($secondScheme === 'https' ? 443 : 80));

        return $firstScheme === $secondScheme && $firstHost === $secondHost && $firstPort === $secondPort;
    }

    private function request(
        string $method,
        string $baseUrl,
        string $apiKey,
        string $path,
        ?array $payload,
        array $logContext,
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
            $response = $this->send($method, $normalizedBaseUrl . $normalizedPath, $apiKey, $payload);
            $requestId = $this->extractRequestId($response);
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
                'method' => $method,
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'http_status' => $response->getStatusCode(),
                'provider_request_id' => $requestId,
                'response' => PayloadLogSanitizer::sanitizeValue($data),
            ]);

            return $data;
        } catch (ProviderVideoException $exception) {
            $this->logger->error('gemini video error', [
                'method' => $method,
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
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
                'method' => $method,
                'base_url' => $normalizedBaseUrl,
                'path' => $normalizedPath,
                'context' => $sanitizedLogContext,
                'http_status' => $httpStatus,
                'response' => $responseBody === null ? null : PayloadLogSanitizer::sanitizeResponseBody($responseBody),
                'provider_request_id' => $exception->getResponse() === null ? null : $this->extractRequestId($exception->getResponse()),
                'provider_error_code' => $providerCode,
                'retriable' => $factory === 'retriable',
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

    private function send(string $method, string $url, string $apiKey, ?array $payload): ResponseInterface
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

        return $this->createClient()->{$method}($url, $options);
    }

    private function createClient(): Client
    {
        return $this->clientFactory->create([
            'timeout' => self::REQUEST_TIMEOUT_SECONDS,
            'verify' => true,
        ]);
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

    private function extractRequestId(ResponseInterface $response): ?string
    {
        foreach (['x-request-id', 'x-goog-request-id', 'request-id'] as $header) {
            $value = trim($response->getHeaderLine($header));
            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }
}
