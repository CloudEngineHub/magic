<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\CloudFile\Tests\FileService;

use Dtyq\CloudFile\Kernel\FilesystemProxy;
use Dtyq\CloudFile\Kernel\Struct\CredentialPolicy;
use Dtyq\CloudFile\Kernel\Struct\ImageProcessOptions;
use Dtyq\CloudFile\Tests\CloudFileBaseTest;
use Exception;

/**
 * @internal
 * @coversNothing
 */
class FileServiceTosTest extends CloudFileBaseTest
{
    /**
     * 验证 FileService TOS 临时上传凭证支持切换内网 endpoint.
     */
    public function testGetUploadTemporaryCredentialWithInternalEndpoint()
    {
        $filesystem = $this->getFilesystem();

        $credentialPolicy = new CredentialPolicy([
            'sts' => false,
            'roleSessionName' => 'test',
        ]);
        $res = $filesystem->getUploadTemporaryCredential($credentialPolicy, $this->getOptions(array_merge($filesystem->getOptions(), [
            'internal_endpoint' => true,
        ])));

        $this->assertArrayHasKey('temporary_credential', $res);
        $this->assertArrayHasKey('host', $res['temporary_credential']);
        $this->assertStringContainsString('.ivolces.com', $res['temporary_credential']['host']);
        $this->assertStringNotContainsString('.volces.com', $res['temporary_credential']['host']);
    }

    public function testGetLinksImage()
    {
        $filesystem = $this->getFilesystem();

        $imageOptions = (new ImageProcessOptions())
            ->resize([
                'height' => 100,
            ])->format('webp');

        $options = ['image' => $imageOptions, 'internal' => true];
        $options = array_merge($options, $this->getOptions($filesystem->getOptions()));

        $list = $filesystem->getLinks([
            'easy-file/tos_demo.png',
        ], [], 7200, $options);
        $this->assertArrayHasKey('easy-file/tos_demo.png', $list);
    }

    public function testGetLinksImageByCredential()
    {
        $this->markTestSkipped('当前文件服务 TOS STS 获取失败，跳过凭证签名链接测试。');

        $filesystem = $this->getFilesystem();

        $imageOptions = (new ImageProcessOptions())
            ->resize([
                'height' => 64,
            ])->format('webp');

        $options = ['image' => $imageOptions, 'internal' => true];
        $options = array_merge($options, $this->getOptions($filesystem->getOptions()));

        $url = $filesystem->getPreSignedUrlByCredential(
            new CredentialPolicy(),
            'easy-file/tos_demo.png',
            $options
        );
        $this->assertIsString($url);
    }

    protected function getStorageName(): string
    {
        return 'file_service_tos_test';
    }

    /**
     * 获取 TOS 文件服务存储实例.
     */
    protected function getFilesystem(): FilesystemProxy
    {
        try {
            $easyFile = $this->createCloudFile();
            return $easyFile->get('file_service_tos_test');
        } catch (Exception $e) {
            $this->skipTestDueToMissingConfig('file_service_tos_test configuration not available: ' . $e->getMessage());
        }
    }

    private function getOptions(array $options = []): array
    {
        return array_merge($options, [
            'cache' => false,
        ]);
    }
}
