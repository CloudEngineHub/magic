<?php

declare(strict_types=1);

/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Project\Service;

use App\Application\SuperMagic\Project\Service\PublishedMicroAppResolver;
use App\Domain\File\Service\FileDomainService;
use App\Domain\SuperMagic\Common\Share\Service\ResourceShareDomainService;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Repository\Facade\TaskFileRepositoryInterface;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use App\Domain\SuperMagic\Project\Repository\Facade\ProjectRepositoryInterface;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
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
            ->with($organizationCode, [$icon->getFileKey()], StorageBucketType::SandBox)
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
        $organizationCode = 'ORG-1';
        $rootDirectory = $this->createFile('/', 'workspace/app/', null, 3001);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->expects($this->once())
            ->method('findRootDirectoryByProjectId')
            ->with($projectId)
            ->willReturn($rootDirectory);
        $taskFileRepository->expects($this->once())
            ->method('getByProjectParentAndName')
            ->with($projectId, 3001, 'icon.svg')
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

    private function createFile(string $fileName, string $fileKey, ?int $parentId, int $fileId): TaskFileEntity
    {
        $file = new TaskFileEntity();
        $file->setFileId($fileId);
        $file->setFileName($fileName);
        $file->setFileKey($fileKey);
        $file->setParentId($parentId);
        return $file;
    }
}
