<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\Assets;

use App\Infrastructure\ExternalAPI\Assets\VolcengineArkAssetsClient;
use ArrayObject;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Hyperf\Guzzle\ClientFactory;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * Ark Assets 第三方接口客户端的契约测试。
 *
 * 这些测试使用 Guzzle MockHandler，不会访问真实火山接口；重点验证签名请求
 * 的结构和原始响应解析，方便后续用 API Explorer 的结果逐字段比对。
 *
 * @internal
 */
final class VolcengineArkAssetsClientTest extends TestCase
{
    /** @var ArrayObject<int, array<string, mixed>> */
    private ArrayObject $history;

    public function testMissingAccessKeyOrSecretKeyReturnsClearError(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Access Key');

        $client = new VolcengineArkAssetsClient(
            $this->createMock(ClientFactory::class),
            [
                'secret_key' => 'sk-test',
                'region' => 'cn-beijing',
            ],
        );

        $client->request('GetAsset', ['Id' => 'asset-test']);
    }

    public function testUnsupportedActionIsRejectedBeforeSendingHttpRequest(): void
    {
        $factory = $this->createMock(ClientFactory::class);
        $factory->expects(self::never())->method('create');

        $client = new VolcengineArkAssetsClient($factory, $this->validConfig());

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('不支持的 Assets Action');
        $client->request('UnknownAction', []);
    }

    public function testRequestBuildsSignedArkAssetsRequestAndParsesOriginalJsonResponse(): void
    {
        $mockResponse = [
            'ResponseMetadata' => ['RequestId' => 'req-test-001'],
            'Result' => ['Id' => 'group-test-001'],
        ];
        $httpClient = $this->createHttpClient($mockResponse);
        $factory = $this->createMock(ClientFactory::class);
        $factory->expects(self::once())->method('create')->willReturn($httpClient);

        $payload = [
            'Name' => '联调角色组',
            'Description' => '用于测试签名和响应原样返回',
            'GroupType' => 'AIGC',
            'ProjectName' => 'default',
        ];

        $client = new VolcengineArkAssetsClient($factory, $this->validConfig());
        $response = $client->request('CreateAssetGroup', $payload);

        // 客户端应返回火山接口原始 JSON 解码后的结构，不丢失 ResponseMetadata 等字段。
        self::assertSame($mockResponse, $response);
        self::assertCount(1, $this->history);

        $request = $this->history[0]['request'];
        self::assertSame('POST', $request->getMethod());
        self::assertSame(
            '/?Action=CreateAssetGroup&Version=2024-01-01',
            $request->getUri()->getPath() . '?' . $request->getUri()->getQuery(),
        );
        self::assertSame('application/json', $request->getHeaderLine('Content-Type'));
        self::assertNotSame('', $request->getHeaderLine('X-Date'));
        self::assertMatchesRegularExpression('/^\d{8}T\d{6}Z$/', $request->getHeaderLine('X-Date'));
        self::assertSame(hash('sha256', (string) $request->getBody()), $request->getHeaderLine('X-Content-Sha256'));
        self::assertMatchesRegularExpression(
            '/^HMAC-SHA256 Credential=ak-test\/\d{8}\/cn-beijing\/ark\/request, SignedHeaders=.*?, Signature=[a-f0-9]{64}$/',
            $request->getHeaderLine('Authorization'),
        );
        self::assertStringNotContainsString('sk-test', $request->getHeaderLine('Authorization'));
        self::assertSame($payload, json_decode((string) $request->getBody(), true, 512, JSON_THROW_ON_ERROR));
    }

    public function testGetAssetRequestUsesAssetIdAndReturnsStatusFieldsUnchanged(): void
    {
        $mockResponse = [
            'Result' => [
                'Id' => 'asset-test-001',
                'Status' => 'Processing',
                'Moderation' => ['Status' => 'Pending'],
            ],
        ];
        $factory = $this->createMock(ClientFactory::class);
        $factory->method('create')->willReturn($this->createHttpClient($mockResponse));

        $client = new VolcengineArkAssetsClient($factory, $this->validConfig());
        $response = $client->request('GetAsset', ['Id' => 'asset-test-001', 'ProjectName' => 'default']);

        self::assertSame('Processing', $response['Result']['Status']);
        self::assertSame('asset-test-001', $response['Result']['Id']);
        self::assertCount(1, $this->history);
        self::assertSame(
            ['Id' => 'asset-test-001', 'ProjectName' => 'default'],
            json_decode((string) $this->history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR),
        );
    }

    private function createHttpClient(array $response): Client
    {
        $this->history = new ArrayObject();
        $handler = new MockHandler([
            new Response(
                200,
                ['Content-Type' => 'application/json'],
                json_encode($response, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ),
        ]);
        $stack = HandlerStack::create($handler);
        $stack->push(Middleware::history($this->history));

        return new Client(['handler' => $stack]);
    }

    /**
     * @return array<string, string>
     */
    private function validConfig(): array
    {
        return [
            'access_key' => 'ak-test',
            'secret_key' => 'sk-test',
            'region' => 'cn-beijing',
            'endpoint' => 'https://open.volcengineapi.com',
            'service' => 'ark',
            'version' => '2024-01-01',
        ];
    }
}
