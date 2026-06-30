<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\CloudFile\Tests\Utils;

use Dtyq\CloudFile\Kernel\Exceptions\CloudFileException;
use Dtyq\CloudFile\Kernel\Utils\RemoteDownloadSecurityConfig;
use Dtyq\CloudFile\Kernel\Utils\RemoteUrlSecurityValidator;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 * @coversNothing
 */
class RemoteUrlSecurityValidatorTest extends TestCase
{
    /**
     * 校验非 HTTPS 协议会被拒绝，避免本地流包装器被当作远程文件读取。
     */
    public function testRejectsUnsafeSchemes(): void
    {
        $validator = new RemoteUrlSecurityValidator();

        $this->expectException(CloudFileException::class);

        $validator->validate('file:///etc/passwd');
    }

    /**
     * 校验内网、回环和本地链路 IP 会被拒绝。
     */
    public function testRejectsNonPublicIps(): void
    {
        $validator = new RemoteUrlSecurityValidator();

        foreach ([
            'https://127.0.0.1/file.txt',
            'https://10.0.0.1/file.txt',
            'https://172.16.0.1/file.txt',
            'https://192.168.0.1/file.txt',
            'https://169.254.1.1/file.txt',
            'https://[::1]/file.txt',
        ] as $url) {
            try {
                $validator->validate($url);
                $this->fail(sprintf('Expected [%s] to be rejected', $url));
            } catch (CloudFileException) {
                $this->assertTrue(true);
            }
        }
    }

    /**
     * 校验云厂商元数据地址会被显式拒绝。
     */
    public function testRejectsCloudMetadataIps(): void
    {
        $validator = new RemoteUrlSecurityValidator();

        $this->expectException(CloudFileException::class);

        $validator->validate('https://100.100.100.200/latest/meta-data');
    }

    /**
     * 校验远程下载只允许 HTTPS 默认端口。
     */
    public function testRejectsUnexpectedPorts(): void
    {
        $validator = new RemoteUrlSecurityValidator();

        $this->expectException(CloudFileException::class);

        $validator->validate('https://127.0.0.1:8443/file.txt');
    }

    /**
     * 校验 standard 等级允许 HTTP 协议进入 IP 安全校验。
     */
    public function testStandardLevelAllowsHttpBeforeIpValidation(): void
    {
        $validator = new RemoteUrlSecurityValidator(RemoteDownloadSecurityConfig::fromArray([
            'enabled' => true,
            'level' => RemoteDownloadSecurityConfig::LEVEL_STANDARD,
        ]));

        try {
            $validator->validate('http://127.0.0.1/file.txt');
            $this->fail('Expected non-public HTTP URL to be rejected by IP validation');
        } catch (CloudFileException $exception) {
            $this->assertStringContainsString('loopback ip', $exception->getMessage());
        }
    }

    /**
     * 校验 compatible 等级允许非默认端口进入 IP 安全校验。
     */
    public function testCompatibleLevelAllowsCustomPortBeforeIpValidation(): void
    {
        $validator = new RemoteUrlSecurityValidator(RemoteDownloadSecurityConfig::fromArray([
            'enabled' => true,
            'level' => RemoteDownloadSecurityConfig::LEVEL_COMPATIBLE,
        ]));

        try {
            $validator->validate('https://127.0.0.1:8443/file.txt');
            $this->fail('Expected non-public custom port URL to be rejected by IP validation');
        } catch (CloudFileException $exception) {
            $this->assertStringContainsString('loopback ip', $exception->getMessage());
        }
    }

    /**
     * 校验私网地址拦截可以通过配置关闭。
     */
    public function testCanDisablePrivateIpProtection(): void
    {
        $config = RemoteDownloadSecurityConfig::fromArray([
            'ip_protection' => [
                'block_private_ip' => false,
            ],
        ]);
        $validator = new RemoteUrlSecurityValidator($config);

        $safeUrl = $validator->validate('https://10.0.0.1/file.txt');

        $this->assertSame('10.0.0.1', $safeUrl['ip']);
    }

    /**
     * 校验额外 IP 黑名单在关闭内置分类时仍然生效。
     */
    public function testExtraBlockedIpStillApplies(): void
    {
        $config = RemoteDownloadSecurityConfig::fromArray([
            'ip_protection' => [
                'block_reserved_ip' => false,
                'extra_blocked_ips' => ['203.0.113.10'],
            ],
        ]);
        $validator = new RemoteUrlSecurityValidator($config);

        $this->expectException(CloudFileException::class);

        $validator->validate('https://203.0.113.10/file.txt');
    }
}
