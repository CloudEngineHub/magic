<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\SuperAgent\Service;

use App\Domain\File\Service\FileDomainService;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
use Dtyq\SuperMagic\Application\SuperAgent\Service\PublishedMicroAppResolver;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileRepositoryInterface;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class PublishedMicroAppResolverTest extends TestCase
{
    public function testResolvesInstallIconOnlyFromTheAppConfigDirectory(): void
    {
        $projectId = 2001;
        $parentId = 3001;
        $organizationCode = 'ORG-1';
        $appConfig = $this->createFile('app.json', 'workspace/app/app.json', $parentId);
        $icon = $this->createFile('icon.svg', 'workspace/app/icon.svg', $parentId);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->expects($this->once())
            ->method('getByProjectIdAndFileName')
            ->with($projectId, 'app.json')
            ->willReturn($appConfig);
        $taskFileRepository->expects($this->once())
            ->method('getByProjectParentAndName')
            ->with($projectId, $parentId, 'icon.svg')
            ->willReturn($icon);

        $url = 'https://files.example.com/icon.svg';
        $links = [$icon->getFileKey() => new FileLink($icon->getFileKey(), $url, 3600)];

        $fileDomainService = $this->createMock(FileDomainService::class);
        $fileDomainService->expects($this->once())
            ->method('getLinks')
            ->with(
                $organizationCode,
                [$icon->getFileKey()],
                StorageBucketType::SandBox
            )
            ->willReturn($links);

        $resolver = new PublishedMicroAppResolver(
            $this->createMock(MicroAppRepositoryInterface::class),
            $this->createMock(ProjectRepositoryInterface::class),
            $this->createMock(ResourceShareDomainService::class),
            $taskFileRepository,
            $fileDomainService,
        );
        $record = (new MicroAppEntity())
            ->setProjectId($projectId)
            ->setOrganizationCode($organizationCode);

        self::assertSame($url, $resolver->getInstallIconUrl($record));
    }

    private function createFile(string $fileName, string $fileKey, int $parentId): TaskFileEntity
    {
        $file = new TaskFileEntity();
        $file->setFileName($fileName);
        $file->setFileKey($fileKey);
        $file->setParentId($parentId);
        return $file;
    }
}
