<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\Assets;

use App\Infrastructure\ExternalAPI\Sms\Volcengine\Base\Sign;
use App\Infrastructure\ExternalAPI\Sms\Volcengine\Base\SignParam;
use DateTime;
use DateTimeImmutable;
use GuzzleHttp\Client;
use Hyperf\Guzzle\ClientFactory;
use Hyperf\Logger\LoggerFactory;
use InvalidArgumentException;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;
use RuntimeException;
use Throwable;

/**
 * 火山方舟 Ark Assets 接口客户端。
 *
 * 该客户端只负责第三方接口联调，不写入本地素材业务表；命令会把返回的
 * 原始 JSON 直接输出，便于与官方 API Explorer 的结果逐字段核对。
 */
class VolcengineArkAssetsClient
{
    private const array SUPPORTED_ACTIONS = [
        'CreateAssetGroup',
        'CreateAsset',
        'GetAsset',
        'ListAssets',
        'GetAssetGroup',
        'ListAssetGroups',
        'UpdateAsset',
        'UpdateAssetGroup',
        'DeleteAsset',
        'DeleteAssetGroup',
    ];

    private const int REQUEST_TIMEOUT_SECONDS = 30;

    private readonly LoggerInterface $logger;

    private readonly Sign $signer;

    /**
     * @param array<string, mixed> $config
     */
    public function __construct(
        private readonly ClientFactory $clientFactory,
        private readonly array $config,
        ?LoggerFactory $loggerFactory = null,
        ?Sign $signer = null,
    ) {
        $this->logger = $loggerFactory?->get(self::class) ?? new NullLogger();
        $this->signer = $signer ?? new Sign();
    }

    /**
     * 调用指定 Assets Action，并返回火山接口原始 JSON 解码结果。
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function request(string $action, array $payload): array
    {
        $request = $this->buildRequest($action, $payload);
        $this->logger->info('开始调用火山方舟 Assets 接口', [
            'action' => $action,
            'payload' => $payload,
        ]);

        try {
            $response = $this->createClient()->post($request['url'], [
                'headers' => $request['headers'],
                // 使用 body 而不是 json，确保签名使用的字节与实际发送内容完全一致。
                'body' => $request['body'],
                'http_errors' => false,
            ]);
            $rawBody = (string) $response->getBody();
            $decoded = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($decoded)) {
                throw new RuntimeException('火山 Assets 返回内容不是 JSON 对象');
            }

            $this->logger->info('火山方舟 Assets 接口调用完成', [
                'action' => $action,
                'http_status' => $response->getStatusCode(),
                'response' => $decoded,
            ]);

            if ($response->getStatusCode() >= 400) {
                throw new RuntimeException(sprintf(
                    '火山 Assets 请求失败（HTTP %d）：%s',
                    $response->getStatusCode(),
                    $rawBody,
                ));
            }

            return $decoded;
        } catch (Throwable $exception) {
            $this->logger->error('火山方舟 Assets 接口调用失败', [
                'action' => $action,
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }
    }

    /**
     * 构造签名请求，公开该方法便于单元测试和排查签名问题。
     *
     * @param array<string, mixed> $payload
     * @return array{url: string, headers: array<string, string>, body: string}
     */
    public function buildRequest(string $action, array $payload, ?DateTimeImmutable $date = null): array
    {
        $this->validateConfig();
        if (! in_array($action, self::SUPPORTED_ACTIONS, true)) {
            throw new InvalidArgumentException('不支持的 Assets Action：' . $action);
        }

        $endpoint = rtrim((string) ($this->config['endpoint'] ?? 'https://open.volcengineapi.com'), '/');
        $endpointParts = parse_url($endpoint);
        $host = (string) ($endpointParts['host'] ?? 'open.volcengineapi.com');
        if (isset($endpointParts['port'])) {
            $host .= ':' . $endpointParts['port'];
        }
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $payloadHash = hash('sha256', $body);
        $query = [
            'Action' => $action,
            'Version' => (string) ($this->config['version'] ?? '2024-01-01'),
        ];

        $signParam = new SignParam();
        $signParam->setDate($date === null ? new DateTime() : new DateTime($date->format(DateTime::ATOM)));
        $signParam->setHeaderList([
            'Content-Type' => ['application/json'],
            'Host' => [$host],
            'X-Content-Sha256' => [$payloadHash],
        ]);
        $signParam->setHost($host);
        $signParam->setPath('/');
        $signParam->setMethod('POST');
        $signParam->setQueryList($query);
        $signParam->setPayloadHash($payloadHash);
        $signParam->setIsSignUrl(false);

        $signed = $this->signer->signOnly($signParam, [
            'region' => (string) ($this->config['region'] ?? 'cn-beijing'),
            'service' => (string) ($this->config['service'] ?? 'ark'),
            'ak' => (string) $this->config['access_key'],
            'sk' => (string) $this->config['secret_key'],
        ]);

        $url = $endpoint . '/?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        return [
            'url' => $url,
            'headers' => [
                'Content-Type' => 'application/json',
                'Host' => $host,
                'X-Date' => $signed->getXDate(),
                'X-Content-Sha256' => $payloadHash,
                'Authorization' => $signed->getAuthorization(),
            ],
            'body' => $body,
        ];
    }

    /** @param array<string, mixed> $payload */
    public function createAssetGroup(array $payload): array
    {
        return $this->request('CreateAssetGroup', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function createAsset(array $payload): array
    {
        return $this->request('CreateAsset', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function getAsset(array $payload): array
    {
        return $this->request('GetAsset', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function listAssets(array $payload): array
    {
        return $this->request('ListAssets', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function getAssetGroup(array $payload): array
    {
        return $this->request('GetAssetGroup', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function listAssetGroups(array $payload): array
    {
        return $this->request('ListAssetGroups', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function deleteAsset(array $payload): array
    {
        return $this->request('DeleteAsset', $payload);
    }

    /** @param array<string, mixed> $payload */
    public function deleteAssetGroup(array $payload): array
    {
        return $this->request('DeleteAssetGroup', $payload);
    }

    private function validateConfig(): void
    {
        if (trim((string) ($this->config['access_key'] ?? '')) === '') {
            throw new InvalidArgumentException('缺少火山引擎 Access Key，请设置 VOLCENGINE_ACCESS_KEY');
        }
        if (trim((string) ($this->config['secret_key'] ?? '')) === '') {
            throw new InvalidArgumentException('缺少火山引擎 Secret Key，请设置 VOLCENGINE_SECRET_KEY');
        }
    }

    private function createClient(): Client
    {
        return $this->clientFactory->create([
            'timeout' => self::REQUEST_TIMEOUT_SECONDS,
        ]);
    }
}
