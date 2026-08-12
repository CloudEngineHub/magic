<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Event\Subscribe;

use App\Application\Design\Event\Subscribe\DesignImageGenerationSubscriber;
use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
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

    public function testBuildImageCompletionPayloadStoresSingleImageAndEmptyTaskFileName(): void
    {
        $payload = $this->buildImageCompletionPayload('poster', [
            'https://example.test/generated/first.png',
        ], '/workspace/design');

        $this->assertSame('', $payload['file_name']);
        $this->assertSame([
            [
                'index' => 1,
                'file_name' => 'poster.png',
                'file_path' => '/workspace/design/poster.png',
            ],
        ], $payload['output_images']);
    }

    public function testBuildImageCompletionPayloadUsesPerImagePathAndEmptyTaskFileName(): void
    {
        $payload = $this->buildImageCompletionPayload('poster', [
            'https://example.test/generated/first.png',
            'https://example.test/generated/second.webp',
        ], '/workspace/design');

        $this->assertSame('', $payload['file_name']);
        $this->assertSame([
            [
                'index' => 1,
                'file_name' => 'poster.png',
                'file_path' => '/workspace/design/poster.png',
            ],
            [
                'index' => 2,
                'file_name' => 'poster_2.webp',
                'file_path' => '/workspace/design/poster_2.webp',
            ],
        ], $payload['output_images']);
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

    /**
     * @param array<int, string> $imageUrls
     * @return array{file_name: string, output_images: array<int, array{index: int, file_name: string, file_path: string}>}
     */
    private function buildImageCompletionPayload(string $baseName, array $imageUrls, string $fileDir): array
    {
        $reflection = new ReflectionClass(DesignImageGenerationSubscriber::class);
        $subscriber = $reflection->newInstanceWithoutConstructor();
        $method = $reflection->getMethod('buildImageCompletionPayload');

        return $method->invoke($subscriber, $baseName, $imageUrls, $fileDir);
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
