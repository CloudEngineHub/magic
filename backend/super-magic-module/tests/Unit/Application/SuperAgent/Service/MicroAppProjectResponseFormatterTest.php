<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\SuperAgent\Service;

use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\File\Service\FileDomainService;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppProjectResponseFormatter;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppShareConfig;
use Dtyq\SuperMagic\Domain\Share\Entity\ResourceShareEntity;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Infrastructure\Utils\ShareUrlBuilder;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class MicroAppProjectResponseFormatterTest extends TestCase
{
    public function testFormatsMicroAppDetailsWithPureMode(): void
    {
        $shareEntity = (new ResourceShareEntity())
            ->setExtra(['allow_copy_project_files' => true, 'pure_mode' => true]);
        $shareDomainService = $this->createMock(ResourceShareDomainService::class);
        $shareDomainService->expects(self::once())
            ->method('getShareByResourceIdWithTrashed')
            ->with('resource-1')
            ->willReturn($shareEntity);

        $shareUrlBuilder = $this->createMock(ShareUrlBuilder::class);
        $shareUrlBuilder->method('buildMicroAppShareUrl')->with('1001')->willReturn('https://example.com/micro-app/1001');

        $formatter = new MicroAppProjectResponseFormatter(
            $shareUrlBuilder,
            new FileDomainService($this->createMock(CloudFileRepositoryInterface::class)),
            $shareDomainService,
            new MicroAppShareConfig(),
        );

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

        self::assertTrue($result['publish']['pure_mode']);
        self::assertSame('Demo App', $result['project']['project_name']);
    }

    public function testFormatsPublishedResolutionWithPureMode(): void
    {
        $formatter = new MicroAppProjectResponseFormatter(
            $this->createMock(ShareUrlBuilder::class),
            new FileDomainService($this->createMock(CloudFileRepositoryInterface::class)),
            $this->createMock(ResourceShareDomainService::class),
            new MicroAppShareConfig(),
        );

        $result = $formatter->formatPublishedResolution(
            (new MicroAppEntity())
                ->setId(1001)
                ->setResourceId('resource-1')
                ->setOrganizationCode('org-1'),
            (new ResourceShareEntity())
                ->setShareCode('share-code-1')
                ->setExtra(['pure_mode' => true]),
        );

        self::assertSame('share-code-1', $result['share_code']);
        self::assertTrue($result['pure_mode']);
    }
}
