<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\Search;

use App\Infrastructure\Core\Traits\HasLogger;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Exception\TransferException;
use Hyperf\Codec\Json;
use Hyperf\Contract\ConfigInterface;
use RuntimeException;
use Throwable;

class DeepSeekSearch
{
    use HasLogger;

    private const string DEFAULT_ENDPOINT = 'https://api.deepseek.com/v1/tools/search';

    private const int DEFAULT_SEARCH_ENGINE_TIMEOUT = 15;

    private const int MAX_ATTEMPTS = 2;

    /**
     * 负责调用 DeepSeek Search API，并只对官方建议的临时错误重试一次。
     */
    public function __construct(protected readonly ConfigInterface $config)
    {
    }

    /**
     * 执行 DeepSeek 搜索；请求体只发送统一搜索需要的 query、count 和 need_content。
     *
     * @return array<string, mixed>
     */
    public function search(
        string $query,
        string $apiKey,
        string $requestUrl = '',
        int $count = 10,
    ): array {
        if (trim($query) === '' || mb_strlen($query) > 128) {
            throw new RuntimeException('DeepSeek search query must contain 1 to 128 characters.');
        }

        $requestUrl = trim($requestUrl) !== ''
            ? trim($requestUrl)
            : (string) $this->config->get('search.drivers.deepseek.endpoint', self::DEFAULT_ENDPOINT);

        $payload = [
            'query' => $query,
            'count' => max(1, min(50, $count)),
            'need_content' => false,
        ];

        $lastException = null;
        for ($attempt = 0; $attempt < self::MAX_ATTEMPTS; ++$attempt) {
            try {
                $response = (new Client())->post($requestUrl, [
                    'headers' => [
                        'Authorization' => 'Bearer ' . $apiKey,
                        'Content-Type' => 'application/json',
                    ],
                    'json' => $payload,
                    'timeout' => self::DEFAULT_SEARCH_ENGINE_TIMEOUT,
                    'http_errors' => true,
                ]);

                $decoded = Json::decode($response->getBody()->getContents());
                if (! is_array($decoded)) {
                    throw new RuntimeException('DeepSeek search returned an invalid response.');
                }

                return $decoded;
            } catch (TransferException $exception) {
                $lastException = $exception;
                $statusCode = $exception instanceof RequestException
                    ? $exception->getResponse()?->getStatusCode()
                    : null;
                $retryable = $this->isRetryableStatus($statusCode);
                $this->logger->warning('DeepSeek search request failed.', [
                    'status_code' => $statusCode,
                    'attempt' => $attempt + 1,
                    'retryable' => $retryable,
                ]);

                if (! $retryable || $attempt + 1 >= self::MAX_ATTEMPTS) {
                    break;
                }

                usleep(200_000);
            } catch (Throwable $exception) {
                $lastException = $exception;
                $this->logger->warning('DeepSeek search request failed.', [
                    'attempt' => $attempt + 1,
                    'exception' => $exception::class,
                ]);
                break;
            }
        }

        throw new RuntimeException('DeepSeek search request failed.', 0, $lastException);
    }

    private function isRetryableStatus(?int $statusCode): bool
    {
        // A missing status code represents a transport/timeout failure and can be retried once.
        return $statusCode === null || in_array($statusCode, [408, 429, 500, 504], true);
    }
}
