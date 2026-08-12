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
    public function testResolvesTheRootIconSvg(): void
    {
        $projectId = 2001;
        $rootDirectoryId = 3001;
        $organizationCode = 'ORG-1';
        $rootDirectory = $this->createFile('/', 'workspace/app/', null, $rootDirectoryId);
        $icon = $this->createFile('icon.svg', 'workspace/app/icon.svg', $rootDirectoryId);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->expects($this->once())
            ->method('findRootDirectoryByProjectId')
            ->with($projectId)
            ->willReturn($rootDirectory);
        $taskFileRepository->expects($this->once())
            ->method('getByProjectParentAndName')
            ->with($projectId, $rootDirectoryId, 'icon.svg')
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

        $resolver = $this->createResolver($taskFileRepository, $fileDomainService);
        $record = (new MicroAppEntity())
            ->setProjectId($projectId)
            ->setOrganizationCode($organizationCode);

        self::assertSame($url, $resolver->getInstallIconUrl($record));
    }

    public function testReturnsEmptyWhenTheRootIconSvgIsMissing(): void
    {
        $projectId = 2001;
        $rootDirectoryId = 3001;
        $organizationCode = 'ORG-1';
        $rootDirectory = $this->createFile('/', 'workspace/app/', null, $rootDirectoryId);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->expects($this->once())
            ->method('findRootDirectoryByProjectId')
            ->with($projectId)
            ->willReturn($rootDirectory);
        $taskFileRepository->expects($this->once())
            ->method('getByProjectParentAndName')
            ->with($projectId, $rootDirectoryId, 'icon.svg')
            ->willReturn(null);

        $fileDomainService = $this->createMock(FileDomainService::class);
        $fileDomainService->expects($this->never())->method('getLinks');

        $resolver = $this->createResolver($taskFileRepository, $fileDomainService);
        $record = (new MicroAppEntity())
            ->setProjectId($projectId)
            ->setOrganizationCode($organizationCode);

        self::assertSame('', $resolver->getInstallIconUrl($record));
    }

    private function createResolver(
        TaskFileRepositoryInterface $taskFileRepository,
        FileDomainService $fileDomainService,
    ): PublishedMicroAppResolver {
        return new PublishedMicroAppResolver(
            $this->createMock(MicroAppRepositoryInterface::class),
            $this->createMock(ProjectRepositoryInterface::class),
            $this->createMock(ResourceShareDomainService::class),
            $taskFileRepository,
            $fileDomainService,
        );
    }

    private function createFile(string $fileName, string $fileKey, ?int $parentId, ?int $fileId = null): TaskFileEntity
    {
        $file = new TaskFileEntity();
        if ($fileId !== null) {
            $file->setFileId($fileId);
        }
        $file->setFileName($fileName);
        $file->setFileKey($fileKey);
        $file->setParentId($parentId);
        return $file;
    }
}
