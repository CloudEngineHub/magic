<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Project\Service;

use App\Application\SuperMagic\Project\Service\MicroAppProjectResponseFormatter;
use App\Application\SuperMagic\Project\Service\MicroAppShareConfig;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\File\Service\FileDomainService;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use App\Domain\SuperMagic\Common\Share\Service\ResourceShareDomainService;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Infrastructure\SuperMagic\Utils\ShareUrlBuilder;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class MicroAppProjectResponseFormatterTest extends TestCase
{
    public function testFormatsMicroAppDetailsWithPureMode(): void
    {
        $shareEntity = (new ResourceShareEntity())
            ->setExtra(['allow_copy_project_files' => true, 'pure_mode' => false]);
        $shareDomainService = $this->createMock(ResourceShareDomainService::class);
        $shareDomainService->expects(self::once())
            ->method('getShareByResourceIdWithTrashed')
            ->with('resource-1')
            ->willReturn($shareEntity);

        $shareUrlBuilder = $this->createMock(ShareUrlBuilder::class);
        $shareUrlBuilder->method('buildMicroAppShareUrl')
            ->with('1001')
            ->willReturn('https://example.com/micro-app/1001');

        $formatter = $this->createFormatter($shareUrlBuilder, $shareDomainService);
        $result = $formatter->formatMicroApp(
            (new MicroAppEntity())
                ->setId(1001)
                ->setProjectId(2001)
                ->setResourceId('resource-1')
                ->setShareType(4)
                ->setTargetIds([])
                ->setPublishStatus('published'),
            (new ProjectEntity())
                ->setId(2001)
                ->setUserOrganizationCode('org-1')
                ->setProjectName('Demo App'),
        );

        self::assertFalse($result['publish']['extra']['pure_mode']);
        self::assertArrayNotHasKey('pure_mode', $result['publish']);
        self::assertArrayNotHasKey('allow_copy_project_files', $result['publish']['extra']);
        self::assertSame('Demo App', $result['project']['project_name']);
    }

    public function testFormatsPublishedResolutionWithPureMode(): void
    {
        $formatter = $this->createFormatter();
        $result = $formatter->formatPublishedResolution(
            (new MicroAppEntity())
                ->setId(1001)
                ->setResourceId('resource-1')
                ->setOrganizationCode('org-1'),
            (new ResourceShareEntity())
                ->setShareCode('share-code-1')
                ->setExtra(['pure_mode' => '1']),
        );

        self::assertSame('share-code-1', $result['share_code']);
        self::assertTrue($result['extra']['pure_mode']);
        self::assertArrayNotHasKey('pure_mode', $result);
    }

    public function testFormatsPublishRecordWithShareExtra(): void
    {
        $result = $this->createFormatter()->formatPublishRecord(
            (new MicroAppEntity())->setId(1001),
            null,
            ['pure_mode' => true],
        );

        self::assertTrue($result['extra']['pure_mode']);
        self::assertArrayNotHasKey('pure_mode', $result);
    }

    private function createFormatter(
        ?ShareUrlBuilder $shareUrlBuilder = null,
        ?ResourceShareDomainService $shareDomainService = null,
    ): MicroAppProjectResponseFormatter {
        return new MicroAppProjectResponseFormatter(
            $shareUrlBuilder ?? $this->createMock(ShareUrlBuilder::class),
            new FileDomainService($this->createMock(CloudFileRepositoryInterface::class)),
            $shareDomainService ?? $this->createMock(ResourceShareDomainService::class),
            new MicroAppShareConfig(),
        );
    }
}
