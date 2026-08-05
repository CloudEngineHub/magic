<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\VideoGenerateAPI\MiniMax;

use App\Infrastructure\ExternalAPI\VideoGenerateAPI\MiniMax\MiniMaxVideoClient;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Hyperf\Guzzle\ClientFactory;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\AbstractLogger;

/**
 * @internal
 */
class MiniMaxVideoClientTest extends TestCase
{
    public function testPostLogsPayloadAndResponse(): void
    {
        $httpClient = $this->createMock(Client::class);
        $httpClient->expects($this->once())
            ->method('request')
            ->with(
                'POST',
                'https://api.minimaxi.com/v2/video_generation',
                $this->callback(static function (array $options): bool {
                    return ($options['headers']['Authorization'] ?? null) === 'Bearer secret-api-key'
                        && ($options['json']['model'] ?? null) === 'MiniMax-H3';
                }),
            )
            ->willReturn(new Response(200, ['x-request-id' => 'request-123'], json_encode([
                'task_id' => 'task-123',
            ], JSON_THROW_ON_ERROR)));

        $clientFactory = $this->createMock(ClientFactory::class);
        $clientFactory->expects($this->once())
            ->method('create')
            ->with(['timeout' => 30, 'verify' => false])
            ->willReturn($httpClient);

        $logger = new MiniMaxRecordingLogger();
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->expects($this->once())
            ->method('get')
            ->with(MiniMaxVideoClient::class)
            ->willReturn($logger);

        $client = new MiniMaxVideoClient($clientFactory, $loggerFactory);
        $prompt = str_repeat('detailed prompt ', 160);
        $response = $client->request(
            'POST',
            'https://api.minimaxi.com/',
            'secret-api-key',
            '/v2/video_generation',
            [
                'model' => 'MiniMax-H3',
                'content' => [[
                    'type' => 'text',
                    'text' => $prompt,
                ], [
                    'type' => 'image_url',
                    'image_url' => ['url' => 'data:image/png;base64,very-sensitive-base64-content'],
                ]],
            ],
            ['operation_id' => 'op-minimax-submit'],
        );

        $this->assertSame('task-123', $response['task_id']);
        $this->assertCount(2, $logger->records);
        $this->assertSame('minimax video request', $logger->records[0]['message']);
        $this->assertSame('op-minimax-submit', $logger->records[0]['context']['context']['operation_id']);
        $this->assertSame($prompt, $logger->records[0]['context']['payload']['content'][0]['text']);
        $this->assertSame(
            'data:image/png;base64,very-sensitive-base64-content',
            $logger->records[0]['context']['payload']['content'][1]['image_url']['url'],
        );
        $this->assertSame('minimax video response', $logger->records[1]['message']);
        $this->assertSame(200, $logger->records[1]['context']['http_status']);
        $this->assertSame('request-123', $logger->records[1]['context']['provider_request_id']);
        $this->assertIsInt($logger->records[1]['context']['elapsed_ms']);
    }

    public function testGetErrorLogsTaskContext(): void
    {
        $httpClient = $this->createMock(Client::class);
        $httpClient->expects($this->once())
            ->method('request')
            ->with(
                'GET',
                'https://api.minimaxi.com/v2/query/video_generation/task-429',
                $this->callback(static function (array $options): bool {
                    return ($options['headers']['Authorization'] ?? null) === 'Bearer secret-api-key'
                        && ! array_key_exists('Content-Type', $options['headers'])
                        && ! array_key_exists('json', $options)
                        && ! array_key_exists('query', $options);
                }),
            )
            ->willThrowException(new RequestException(
                'too many requests',
                new Request('GET', 'https://api.minimaxi.com/v2/query/video_generation/task-429'),
                new Response(429, [], '{"base_resp":{"status_msg":"rate limited"}}'),
            ));

        $clientFactory = $this->createMock(ClientFactory::class);
        $clientFactory->expects($this->once())
            ->method('create')
            ->willReturn($httpClient);

        $logger = new MiniMaxRecordingLogger();
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->expects($this->once())
            ->method('get')
            ->with(MiniMaxVideoClient::class)
            ->willReturn($logger);

        $client = new MiniMaxVideoClient($clientFactory, $loggerFactory);

        $this->expectException(ProviderVideoException::class);
        $this->expectExceptionMessage('MiniMax video request failed: {"base_resp":{"status_msg":"rate limited"}}');
        try {
            $client->request(
                'GET',
                'https://api.minimaxi.com',
                'secret-api-key',
                '/v2/query/video_generation/task-429',
                [],
                ['operation_id' => 'op-minimax-query', 'provider_task_id' => 'task-429'],
            );
        } finally {
            $this->assertCount(2, $logger->records);
            $this->assertSame('minimax video error', $logger->records[1]['message']);
            $this->assertSame('op-minimax-query', $logger->records[1]['context']['context']['operation_id']);
            $this->assertSame('task-429', $logger->records[1]['context']['context']['provider_task_id']);
            $this->assertSame(429, $logger->records[1]['context']['http_status']);
        }
    }
}

final class MiniMaxRecordingLogger extends AbstractLogger
{
    /** @var array<int, array{level: string, message: string, context: array<mixed>}> */
    public array $records = [];

    public function log($level, $message, array $context = []): void
    {
        $this->records[] = [
            'level' => (string) $level,
            'message' => (string) $message,
            'context' => $context,
        ];
    }
}
