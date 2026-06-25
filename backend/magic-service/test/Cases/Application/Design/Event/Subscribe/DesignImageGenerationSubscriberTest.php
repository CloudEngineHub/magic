<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Event\Subscribe;

use App\Application\Design\Event\Subscribe\DesignImageGenerationSubscriber;
use App\Domain\Design\Entity\ImageGenerationEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TaskFileDomainService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
final class DesignImageGenerationSubscriberTest extends TestCase
{
    public function testEnsureOutputDirectoryIdFallsBackToFileDirWhenQueuedEntityLostFileDirId(): void
    {
        $entity = new ImageGenerationEntity();
        $entity->setProjectId(123);
        $entity->setFileDir('/cat-swimming/images');

        $taskFileDomainService = $this->createMock(TaskFileDomainService::class);
        $taskFileDomainService->expects($this->never())->method('getById');
        $taskFileDomainService->expects($this->once())
            ->method('findEntityByRelativePath')
            ->with(123, '/cat-swimming/images')
            ->willReturn($this->createDirectory(7001));

        $this->invokeEnsureOutputDirectoryId($taskFileDomainService, $entity);

        $this->assertSame(7001, $entity->getFileDirId());
    }

    public function testEnsureOutputDirectoryIdSkipsLookupWhenFileDirIdExists(): void
    {
        $entity = new ImageGenerationEntity();
        $entity->setProjectId(123);
        $entity->setFileDir('/cat-swimming/images');
        $entity->setFileDirId(7001);

        $taskFileDomainService = $this->createMock(TaskFileDomainService::class);
        $taskFileDomainService->expects($this->never())->method('getById');
        $taskFileDomainService->expects($this->never())->method('findEntityByRelativePath');

        $this->invokeEnsureOutputDirectoryId($taskFileDomainService, $entity);

        $this->assertSame(7001, $entity->getFileDirId());
    }

    private function invokeEnsureOutputDirectoryId(
        TaskFileDomainService $taskFileDomainService,
        ImageGenerationEntity $entity,
    ): void {
        $reflection = new ReflectionClass(DesignImageGenerationSubscriber::class);
        $subscriber = $reflection->newInstanceWithoutConstructor();

        $property = $reflection->getProperty('taskFileDomainService');
        $property->setValue($subscriber, $taskFileDomainService);

        $method = $reflection->getMethod('ensureOutputDirectoryId');
        $method->invoke($subscriber, $entity);
    }

    private function createDirectory(int $fileId): TaskFileEntity
    {
        $directory = new TaskFileEntity();
        $directory->setFileId($fileId);
        $directory->setProjectId(123);
        $directory->setIsDirectory(true);

        return $directory;
    }
}
