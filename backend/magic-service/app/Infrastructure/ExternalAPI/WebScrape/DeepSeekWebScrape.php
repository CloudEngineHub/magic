<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\WebScrape;

use Exception;
use GuzzleHttp\Exception\RequestException;
use Hyperf\Codec\Json;
use InvalidArgumentException;
use RuntimeException;

/**
 * DeepSeek Fetch 网页抓取实现。
 */
class DeepSeekWebScrape extends AbstractWebScrape
{
    private string $requestUrl;

    private string $apiKey;

    public function configure(array $config): void
    {
        $this->requestUrl = (string) ($config['request_url'] ?? '');
        $this->apiKey = (string) ($config['api_key'] ?? '');

        if (isset($config['timeout'])) {
            $this->setTimeout((int) $config['timeout']);
        }

        if ($this->requestUrl === '' || $this->apiKey === '') {
            throw new InvalidArgumentException('Missing required configuration: request_url or api_key');
        }
    }

    public function getPlatformName(): string
    {
        return 'deepseek';
    }

    public function scrape(string $url, array $formats, string $mode, array $options = []): WebScrapeResponse
    {
        $this->validateRequest($url, $formats);
        $this->logRequest($url, ['url' => $url]);

        try {
            $startTime = microtime(true);
            $response = $this->httpClient->request('POST', $this->requestUrl, [
                'headers' => [
                    'Authorization' => 'Bearer ' . $this->apiKey,
                    'Content-Type' => 'application/json',
                ],
                'json' => ['url' => $url],
                'http_errors' => true,
            ]);

            $data = Json::decode($response->getBody()->getContents());
            if (! is_array($data) || ! array_key_exists('content', $data)) {
                throw new RuntimeException('DeepSeek Fetch returned an invalid response.');
            }

            $metadata = [
                'duration_ms' => (int) ((microtime(true) - $startTime) * 1000),
                'status_code' => $response->getStatusCode(),
                'title' => (string) ($data['title'] ?? ''),
                'actual_format' => 'MARKDOWN',
            ];

            $this->logResponse($url, true);

            return WebScrapeResponse::success(
                url: $url,
                content: (string) $data['content'],
                provider: $this->getPlatformName(),
                formats: $formats,
                metadata: $metadata
            );
        } catch (RequestException $e) {
            $statusCode = $e->getResponse()?->getStatusCode() ?? 0;
            $reason = $e->getResponse()?->getReasonPhrase() ?? $e->getMessage();
            $error = sprintf('HTTP %d %s', $statusCode, $reason);
            $this->logResponse($url, false, $error);
            throw new RuntimeException("DeepSeek WebScrape error: {$error}", 0, $e);
        } catch (Exception $e) {
            $this->logResponse($url, false, $e->getMessage());
            throw new RuntimeException('DeepSeek WebScrape error: ' . $e->getMessage(), 0, $e);
        }
    }
}
