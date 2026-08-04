<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\File\Service;

use App\Domain\File\Entity\FileCleanupRecordEntity;
use App\Domain\File\Repository\FileCleanupRecordRepository;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\File\Service\FileCleanupDomainService;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use RuntimeException;

/**
 * @internal
 */
class FileCleanupDomainServiceTest extends TestCase
{
    public function testDeletesOrganizationPublicObjectAndCleanupRecord(): void
    {
        $record = $this->createRecord('ORG001', 'ORG001/open/generated/image.png');
        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->once())->method('delete')->with(1001);
        $repository->expects($this->never())->method('incrementRetry');

        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->expects($this->once())->method('getFullPrefix')->with('ORG001')->willReturn('ORG001/open/');
        $cloudFileRepository->expects($this->once())
            ->method('deleteObjectByCredential')
            ->with(
                'ORG001/open/',
                'ORG001',
                'ORG001/open/generated/image.png',
                StorageBucketType::Public
            );

        self::assertSame('success', $this->createService($repository, $cloudFileRepository)->cleanupSingleFile($record));
    }

    public function testRoutesSharedMagicObjectToMagicOrganization(): void
    {
        $record = $this->createRecord('ORG001', 'MAGIC/open/generated/image.png');
        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->once())->method('delete')->with(1001);

        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->expects($this->once())->method('getFullPrefix')->with('MAGIC')->willReturn('MAGIC/open/');
        $cloudFileRepository->expects($this->once())
            ->method('deleteObjectByCredential')
            ->with(
                'MAGIC/open/',
                'MAGIC',
                'MAGIC/open/generated/image.png',
                StorageBucketType::Public
            );

        self::assertSame('success', $this->createService($repository, $cloudFileRepository)->cleanupSingleFile($record));
    }

    public function testDeletesOrganizationPrivateObject(): void
    {
        $record = $this->createRecord(
            'ORG001',
            'ORG001/open/private-hash/open/video-generation/video.mp4',
            StorageBucketType::Private
        );
        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->once())->method('delete')->with(1001);

        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->expects($this->once())->method('getFullPrefix')->with('ORG001')->willReturn('ORG001/open/');
        $cloudFileRepository->expects($this->once())
            ->method('deleteObjectByCredential')
            ->with(
                'ORG001/open/',
                'ORG001',
                'ORG001/open/private-hash/open/video-generation/video.mp4',
                StorageBucketType::Private
            );

        self::assertSame('success', $this->createService($repository, $cloudFileRepository)->cleanupSingleFile($record));
    }

    public function testIncrementsRetryWhenObjectDeletionThrows(): void
    {
        $record = $this->createRecord('ORG001', 'ORG001/open/generated/image.png');
        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->never())->method('delete');
        $repository->expects($this->once())
            ->method('incrementRetry')
            ->with(1001, 'File cleanup exception: storage unavailable');

        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->method('getFullPrefix')->willReturn('ORG001/open/');
        $cloudFileRepository->method('deleteObjectByCredential')->willThrowException(new RuntimeException('storage unavailable'));

        self::assertSame('failed', $this->createService($repository, $cloudFileRepository)->cleanupSingleFile($record));
    }

    private function createRecord(
        string $organizationCode,
        string $fileKey,
        StorageBucketType $bucketType = StorageBucketType::Public
    ): FileCleanupRecordEntity {
        return (new FileCleanupRecordEntity())
            ->setId(1001)
            ->setOrganizationCode($organizationCode)
            ->setFileKey($fileKey)
            ->setFileName(basename($fileKey))
            ->setFileSize(0)
            ->setBucketType($bucketType->value)
            ->setSourceType($bucketType === StorageBucketType::Private ? 'video_generate' : 'image_generate')
            ->setSourceId('request-123')
            ->setExpireAt('2026-07-28 00:00:00')
            ->setStatus(0)
            ->setRetryCount(0)
            ->setErrorMessage(null);
    }

    private function createService(
        FileCleanupRecordRepository $repository,
        CloudFileRepositoryInterface $cloudFileRepository
    ): FileCleanupDomainService {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());
        return new FileCleanupDomainService($repository, $cloudFileRepository, $loggerFactory);
    }
}
