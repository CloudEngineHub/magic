<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\CloudFile\Tests\Struct;

use Dtyq\CloudFile\Kernel\Exceptions\CloudFileException;
use Dtyq\CloudFile\Kernel\Struct\UploadFile;
use Dtyq\CloudFile\Kernel\Utils\RemoteDownloadSecurityConfig;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 * @coversNothing
 */
class UploadFileSecurityTest extends TestCase
{
    protected function tearDown(): void
    {
        RemoteDownloadSecurityConfig::reset();
    }

    /**
     * 校验 UploadFile 在实际读取前会拒绝本地流包装器。
     */
    public function testRejectsLocalStreamWrappersBeforeReading(): void
    {
        $this->expectException(CloudFileException::class);

        new UploadFile('php://temp', 'safe-test');
    }

    /**
     * 校验被识别为 URL 的危险协议也会在下载边界被拒绝。
     */
    public function testRejectsUnsafeUrlSchemesDuringRemoteDownload(): void
    {
        RemoteDownloadSecurityConfig::configure([
            'enabled' => true,
        ]);
        $uploadFile = new UploadFile('file://127.0.0.1/etc/passwd', 'safe-test');

        $this->expectException(CloudFileException::class);

        $uploadFile->getRealPath();
    }

    /**
     * 校验 base64 图片仍按本地临时文件处理，避免修复 SSRF 时破坏历史能力。
     */
    public function testKeepsBase64ImageUploadSupport(): void
    {
        $uploadFile = new UploadFile(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q5wAAAABJRU5ErkJggg==',
            'safe-test',
            '',
            false
        );

        $realPath = $uploadFile->getRealPath();

        $this->assertFileExists($realPath);
        $this->assertSame('image/png', $uploadFile->getMimeType());

        $uploadFile->release();
    }
}
