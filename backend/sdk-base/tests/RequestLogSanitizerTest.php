<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SdkBase\Tests;

use Dtyq\SdkBase\Kernel\Component\Config\LogSanitizerConfig;
use Dtyq\SdkBase\Kernel\Component\Logger\LoggerProxy;
use Dtyq\SdkBase\Kernel\Component\Logger\LogSanitizer;
use Dtyq\SdkBase\SdkBase;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Mockery;
use PHPUnit\Framework\TestCase;
use Psr\Http\Client\ClientInterface;
use Psr\Log\AbstractLogger;
use Psr\Log\LoggerInterface;

/**
 * 请求日志敏感信息过滤测试。
 *
 * @internal
 * @coversNothing
 */
class RequestLogSanitizerTest extends TestCase
{
    /**
     * 验证专用日志脱敏器可以独立创建。
     */
    public function testCreateLogSanitizer(): void
    {
        $sanitizer = new LogSanitizer(new LogSanitizerConfig());

        $this->assertInstanceOf(LogSanitizer::class, $sanitizer);
    }

    /**
     * 验证日志脱敏默认开启。
     */
    public function testSanitizerIsEnabledByDefault(): void
    {
        $sanitizer = new LogSanitizer(new LogSanitizerConfig());

        $context = $sanitizer->sanitize('info', 'test', [
            'token' => 'plain-token',
        ]);

        $this->assertSame('pla***ken', $context['token']);
    }

    /**
     * 验证关闭脱敏后保留原始日志且不执行自定义过滤回调。
     */
    public function testSanitizerCanBeDisabled(): void
    {
        $filterCalled = false;
        $sanitizer = new LogSanitizer(new LogSanitizerConfig([
            'enabled' => false,
            'filter' => static function (string $level, string $message, array $context) use (&$filterCalled): array {
                $filterCalled = true;
                return [];
            },
        ]));

        $context = $sanitizer->sanitize('info', 'test', [
            'token' => 'plain-token',
        ]);

        $this->assertSame('plain-token', $context['token']);
        $this->assertFalse($filterCalled);
    }

    /**
     * 验证部分脱敏模式保留字符串首尾并替换中间内容。
     */
    public function testSanitizerSupportsPartialMask(): void
    {
        $sanitizer = new LogSanitizer(new LogSanitizerConfig([
            'mask_mode' => 'partial',
            'mask' => '***',
            'visible_prefix_length' => 3,
            'visible_suffix_length' => 4,
        ]));

        $context = $sanitizer->sanitize('info', 'test', [
            'token' => 'AKLTMzc1OTM3YzUyNzE2',
            'headers' => [
                'Authorization' => ['Bearer very-sensitive-token'],
            ],
            'uri' => 'https://example.com/api?access_token=query-sensitive-token',
        ]);

        $this->assertSame('AKL***NzE2', $context['token']);
        $this->assertSame(['Bea***oken'], $context['headers']['Authorization']);
        $this->assertStringContainsString('access_token=que%2A%2A%2Aoken', $context['uri']);
    }

    /**
     * 验证部分脱敏模式不会暴露过短的敏感字符串。
     */
    public function testPartialMaskFullyMasksShortValue(): void
    {
        $sanitizer = new LogSanitizer(new LogSanitizerConfig([
            'mask_mode' => 'partial',
            'mask' => '***',
            'visible_prefix_length' => 3,
            'visible_suffix_length' => 3,
        ]));

        $context = $sanitizer->sanitize('info', 'test', ['token' => '123456']);

        $this->assertSame('***', $context['token']);
    }

    /**
     * 验证默认规则能够过滤 Header、查询参数与 JSON 字段。
     */
    public function testDefaultSanitizerFiltersCommonSensitiveValues(): void
    {
        $logger = new MemoryLogger();
        $loggerProxy = new LoggerProxy('test_sdk', $logger, new LogSanitizerConfig([
            'sensitive_headers' => ['x-business-secret'],
            'sensitive_fields' => ['mobile'],
        ]));

        $loggerProxy->info('client_request', [
            'method' => 'POST',
            'uri' => 'https://example.com/api?access_token=query-token&name=test',
            'options' => [
                'headers' => [
                    'Authorization' => 'Bearer token',
                    'Token' => 'header-token',
                    'X-Business-Secret' => 'business-secret',
                    'Content-Type' => 'application/json',
                ],
                'body' => json_encode([
                    'password' => 'password-value',
                    'mobile' => '13800000000',
                    'name' => 'test',
                ], JSON_THROW_ON_ERROR),
            ],
            'content' => json_encode([
                'refresh_token' => 'refresh-token',
                'code' => 0,
            ], JSON_THROW_ON_ERROR),
        ]);
        $context = $logger->records[0]['context'];

        $this->assertSame('Bea***ken', $context['options']['headers']['Authorization']);
        $this->assertSame('hea***ken', $context['options']['headers']['Token']);
        $this->assertSame('bus***ret', $context['options']['headers']['X-Business-Secret']);
        $this->assertSame('application/json', $context['options']['headers']['Content-Type']);
        $this->assertStringContainsString('access_token=que%2A%2A%2Aken', $context['uri']);
        $this->assertSame([
            'password' => 'pas***lue',
            'mobile' => '138***000',
            'name' => 'test',
        ], json_decode($context['options']['body'], true, 512, JSON_THROW_ON_ERROR));
        $this->assertSame([
            'refresh_token' => 'ref***ken',
            'code' => 0,
        ], json_decode($context['content'], true, 512, JSON_THROW_ON_ERROR));
    }

    /**
     * 验证配置回调能够分别处理请求和响应日志。
     */
    public function testClientRequestUsesDefaultAndCustomSanitizers(): void
    {
        $request = new Request(
            'POST',
            'https://example.com/api?token=query-token',
            [
                'Authorization' => 'Bearer token',
                'Content-Type' => 'application/json',
            ],
            json_encode(['prompt' => 'sensitive prompt'], JSON_THROW_ON_ERROR)
        );
        $client = Mockery::mock(Client::class);
        $client->allows()->sendRequest($request)->andReturn(new Response(200, [], '{"code":0}'));
        $logger = new MemoryLogger();
        $container = new Container();
        $container->set(ClientInterface::class, $client);
        $container->set(LoggerInterface::class, $logger);
        $sdkBase = new SdkBase($container, [
            'sdk_name' => 'test_sdk',
            'exception_class' => BusinessException::class,
            'log_sanitizer' => [
                'filter' => static function (string $level, string $message, array $context): array {
                    if ($level === 'info' && $message === 'client_request') {
                        $context['options']['body'] = '[BUSINESS_REDACTED]';
                        $context['content'] = '[RESPONSE_REDACTED]';
                    }
                    return $context;
                },
            ],
        ]);

        $sdkBase->getClientRequest()->sendRequest($request);

        $context = $logger->records[0]['context'];
        $this->assertSame(['Bea***ken'], $context['options']['header']['Authorization']);
        $this->assertStringContainsString('token=que%2A%2A%2Aken', $context['uri']);
        $this->assertSame('[BUSINESS_REDACTED]', $context['options']['body']);
        $this->assertSame('[RESPONSE_REDACTED]', $context['content']);
    }
}

/**
 * 用于断言结构化日志内容的内存日志器。
 */
class MemoryLogger extends AbstractLogger
{
    public array $records = [];

    /**
     * 保存日志级别、消息和上下文供测试断言。
     * @param mixed $level
     * @param mixed $message
     */
    public function log($level, $message, array $context = []): void
    {
        $this->records[] = [
            'level' => $level,
            'message' => $message,
            'context' => $context,
        ];
    }
}
