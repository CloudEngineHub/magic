<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\CloudFile\Tests\Utils;

use Dtyq\CloudFile\Kernel\Utils\RemoteDownloadSecurityConfig;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 * @coversNothing
 */
class RemoteDownloadSecurityConfigTest extends TestCase
{
    protected function tearDown(): void
    {
        RemoteDownloadSecurityConfig::reset();
    }

    /**
     * 校验默认配置关闭远程下载防护，并在启用时使用 strict 策略。
     */
    public function testDefaultProtectionIsDisabledWithStrictLevel(): void
    {
        $config = RemoteDownloadSecurityConfig::fromArray([]);

        $this->assertFalse($config->isEnabled());
        $this->assertSame(RemoteDownloadSecurityConfig::LEVEL_STRICT, $config->getLevel());
        $this->assertSame(['https'], $config->getAllowedSchemes());
        $this->assertSame([443], $config->getAllowedPorts());
    }

    /**
     * 校验 standard 等级允许 HTTP 和 HTTPS 默认端口。
     */
    public function testStandardLevelAllowsDefaultHttpPorts(): void
    {
        $config = RemoteDownloadSecurityConfig::fromArray([
            'level' => RemoteDownloadSecurityConfig::LEVEL_STANDARD,
        ]);

        $this->assertSame(['http', 'https'], $config->getAllowedSchemes());
        $this->assertSame([80, 443], $config->getAllowedPorts());
    }

    /**
     * 校验 compatible 等级允许 HTTP 和 HTTPS 任意端口。
     */
    public function testCompatibleLevelAllowsAnyHttpPort(): void
    {
        $config = RemoteDownloadSecurityConfig::fromArray([
            'level' => RemoteDownloadSecurityConfig::LEVEL_COMPATIBLE,
        ]);

        $this->assertSame(['http', 'https'], $config->getAllowedSchemes());
        $this->assertSame([], $config->getAllowedPorts());
    }

    /**
     * 校验非法等级会回退到 strict，避免配置错误导致防护降级。
     */
    public function testInvalidLevelFallsBackToStrict(): void
    {
        $config = RemoteDownloadSecurityConfig::fromArray([
            'level' => 'unknown',
        ]);

        $this->assertSame(RemoteDownloadSecurityConfig::LEVEL_STRICT, $config->getLevel());
    }

    /**
     * 校验全局配置入口会更新远程下载安全策略。
     */
    public function testConfigureUpdatesCurrentSecurityConfig(): void
    {
        RemoteDownloadSecurityConfig::configure([
            'enabled' => true,
            'level' => RemoteDownloadSecurityConfig::LEVEL_STANDARD,
            'max_download_size' => 1024,
            'max_redirects' => 1,
            'ip_protection' => [
                'block_private_ip' => false,
                'extra_blocked_ips' => ['203.0.113.10'],
                'extra_blocked_cidrs' => ['198.51.100.0/24'],
            ],
        ]);

        $config = RemoteDownloadSecurityConfig::current();

        $this->assertTrue($config->isEnabled());
        $this->assertSame(RemoteDownloadSecurityConfig::LEVEL_STANDARD, $config->getLevel());
        $this->assertSame(1024, $config->getMaxDownloadSize());
        $this->assertSame(1, $config->getMaxRedirects());
        $this->assertFalse($config->shouldBlockPrivateIp());
        $this->assertSame(['203.0.113.10'], $config->getExtraBlockedIps());
        $this->assertSame(['198.51.100.0/24'], $config->getExtraBlockedCidrs());
    }

    /**
     * 校验 env 字符串形式的地址防护配置能被正确解析。
     */
    public function testParsesIpProtectionStringValues(): void
    {
        $config = RemoteDownloadSecurityConfig::fromArray([
            'ip_protection' => [
                'block_loopback_ip' => 'false',
                'extra_blocked_ips' => '["203.0.113.10"]',
                'extra_blocked_cidrs' => '198.51.100.0/24,203.0.113.0/24',
            ],
        ]);

        $this->assertFalse($config->shouldBlockLoopbackIp());
        $this->assertSame(['203.0.113.10'], $config->getExtraBlockedIps());
        $this->assertSame(['198.51.100.0/24', '203.0.113.0/24'], $config->getExtraBlockedCidrs());
    }
}
