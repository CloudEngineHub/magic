<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\ModelGateway\Event\Subscribe;

use App\Application\ModelGateway\Event\Subscribe\GeneratedFileCleanupSubscriber;
use App\Domain\File\Entity\FileCleanupRecordEntity;
use App\Domain\File\Repository\FileCleanupRecordRepository;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\File\Service\FileCleanupDomainService;
use App\Domain\File\Service\FileDomainService;
use App\Domain\ModelGateway\Event\ImageGeneratedEvent;
use App\Domain\ModelGateway\Event\ImageOperationCompletedEvent;
use App\Domain\ModelGateway\Event\VideoGeneratedEvent;
use App\Infrastructure\Core\ValueObject\StorageBucketType;
use Dtyq\CloudFile\Kernel\Struct\FileLink;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Logger\LoggerFactory;
use HyperfTest\Cases\BaseTest;
use Psr\Log\NullLogger;
use RuntimeException;

/**
 * @internal
 */
class GeneratedFileCleanupSubscriberTest extends BaseTest
{
    private ConfigInterface $config;

    private mixed $originalExpireSeconds;

    private mixed $originalVideoExpireSeconds;

    protected function setUp(): void
    {
        parent::setUp();
        $this->config = di(ConfigInterface::class);
        $this->originalExpireSeconds = $this->config->get('image_generate.file_cleanup.expire_seconds');
        $this->originalVideoExpireSeconds = $this->config->get('model_gateway.video_file_cleanup.expire_seconds');
    }

    protected function tearDown(): void
    {
        $this->config->set('image_generate.file_cleanup.expire_seconds', $this->originalExpireSeconds);
        $this->config->set('model_gateway.video_file_cleanup.expire_seconds', $this->originalVideoExpireSeconds);
        parent::tearDown();
    }

    public function testRegistersOnlyOwnedGeneratedImagesOnce(): void
    {
        $this->config->set('image_generate.file_cleanup.expire_seconds', 86400);

        $expected = [
            'ORG001/open/generated/first.png' => 'first.png',
            'MAGIC/open/generated/shared.webp' => 'shared.webp',
        ];
        $registeredKeys = [];
        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->exactly(2))->method('findByFileKey')->willReturn(null);
        $repository->expects($this->exactly(2))
            ->method('create')
            ->willReturnCallback(function (FileCleanupRecordEntity $entity) use ($expected, &$registeredKeys): FileCleanupRecordEntity {
                self::assertSame('ORG001', $entity->getOrganizationCode());
                self::assertArrayHasKey($entity->getFileKey(), $expected);
                self::assertSame($expected[$entity->getFileKey()], $entity->getFileName());
                self::assertSame(0, $entity->getFileSize());
                self::assertSame('image_generate', $entity->getSourceType());
                self::assertSame('request-123', $entity->getSourceId());
                self::assertSame('public', $entity->getBucketType());
                self::assertEqualsWithDelta(time() + 86400, strtotime($entity->getExpireAt()), 2);
                $registeredKeys[] = $entity->getFileKey();
                return $entity;
            });

        $event = $this->createEvent('ORG001', [
            'https://files.example.com/ORG001/open/generated/first.png?signature=1',
            ['url' => 'https://files.example.com/MAGIC/open/generated/shared.webp'],
            ['url' => 'https://files.example.com/ORG001/open/generated/first.png?signature=2'],
            ['url' => 'https://third-party.example.com/external/image.png'],
            ['url' => 'https://evil.example/ORG001/open/generated/victim.png'],
            ['url' => 'https://evil.example/MAGIC/open/generated/shared-victim.png'],
            ['b64_json' => 'ZmFrZQ=='],
            'data:image/png;base64,ZmFrZQ==',
            '',
        ], 'request-123');

        self::assertSame([
            ['url' => 'https://files.example.com/ORG001/open/generated/first.png?signature=1'],
            ['url' => 'https://files.example.com/MAGIC/open/generated/shared.webp'],
            ['url' => 'https://files.example.com/ORG001/open/generated/first.png?signature=2'],
            ['url' => 'https://third-party.example.com/external/image.png'],
            ['url' => 'https://evil.example/ORG001/open/generated/victim.png'],
            ['url' => 'https://evil.example/MAGIC/open/generated/shared-victim.png'],
        ], $event->getGeneratedImages());

        $this->createSubscriber($this->createCleanupService($repository))->process($event);

        sort($registeredKeys);
        self::assertSame([
            'MAGIC/open/generated/shared.webp',
            'ORG001/open/generated/first.png',
        ], $registeredKeys);
    }

    public function testRegistersCompletedImageOperationResult(): void
    {
        $this->config->set('image_generate.file_cleanup.expire_seconds', 86400);

        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->once())->method('findByFileKey')->willReturn(null);
        $repository->expects($this->once())
            ->method('create')
            ->willReturnCallback(function (FileCleanupRecordEntity $entity): FileCleanupRecordEntity {
                self::assertSame('ORG001/open/image-expand/result.png', $entity->getFileKey());
                self::assertSame('operation-123', $entity->getSourceId());
                return $entity;
            });

        $event = new ImageOperationCompletedEvent();
        $event->setOrganizationCode('ORG001');
        $event->setSourceId('operation-123');
        $event->setGeneratedImages([
            ['url' => 'https://files.example.com/ORG001/open/image-expand/result.png'],
            ['b64_json' => 'ZmFrZQ=='],
        ]);

        self::assertSame([
            ['url' => 'https://files.example.com/ORG001/open/image-expand/result.png'],
        ], $event->getGeneratedImages());

        $this->createSubscriber($this->createCleanupService($repository))->process($event);
    }

    public function testListensToGeneratedAndOperationCompletedEvents(): void
    {
        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $subscriber = $this->createSubscriber($this->createCleanupService($repository));

        self::assertSame([
            ImageGeneratedEvent::class,
            ImageOperationCompletedEvent::class,
            VideoGeneratedEvent::class,
        ], $subscriber->listen());
    }

    /**
     * @dataProvider disabledExpireSecondsProvider
     */
    public function testDoesNotRegisterWhenCleanupIsDisabled(int $expireSeconds): void
    {
        $this->config->set('image_generate.file_cleanup.expire_seconds', $expireSeconds);

        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->never())->method('findByFileKey');
        $repository->expects($this->never())->method('create');

        $event = $this->createEvent('ORG001', [
            'https://files.example.com/ORG001/open/generated/first.png',
        ]);

        $this->createSubscriber($this->createCleanupService($repository))->process($event);
    }

    public static function disabledExpireSecondsProvider(): array
    {
        return [
            'zero' => [0],
            'negative' => [-1],
        ];
    }

    public function testRegistrationFailureDoesNotBreakEventProcessing(): void
    {
        $this->config->set('image_generate.file_cleanup.expire_seconds', 86400);

        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->method('findByFileKey')->willReturn(null);
        $repository->method('create')->willThrowException(new RuntimeException('cleanup storage unavailable'));

        $event = $this->createEvent('ORG001', [
            'https://files.example.com/ORG001/open/generated/first.png',
        ]);

        $this->createSubscriber($this->createCleanupService($repository))->process($event);

        $this->addToAssertionCount(1);
    }

    public function testRegistersOwnedGeneratedVideoForSevenDays(): void
    {
        $this->config->set('model_gateway.video_file_cleanup.expire_seconds', 604800);
        $fileKey = 'ORG001/open/' . md5(StorageBucketType::Private->value) . '/open/video-generation/op-1.mp4';

        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->once())->method('findByFileKey')->willReturn(null);
        $repository->expects($this->once())
            ->method('create')
            ->willReturnCallback(function (FileCleanupRecordEntity $entity) use ($fileKey): FileCleanupRecordEntity {
                self::assertSame('ORG001', $entity->getOrganizationCode());
                self::assertSame($fileKey, $entity->getFileKey());
                self::assertSame('op-1.mp4', $entity->getFileName());
                self::assertSame(0, $entity->getFileSize());
                self::assertSame('video_generate', $entity->getSourceType());
                self::assertSame('source-1', $entity->getSourceId());
                self::assertSame('private', $entity->getBucketType());
                self::assertEqualsWithDelta(time() + 604800, strtotime($entity->getExpireAt()), 2);
                return $entity;
            });

        $event = $this->createVideoEvent(
            'ORG001',
            $fileKey,
            'source-1'
        );

        $this->createSubscriber($this->createCleanupService($repository))->process($event);
    }

    public function testDoesNotRegisterVideoWithoutOwnedFileKey(): void
    {
        $this->config->set('model_gateway.video_file_cleanup.expire_seconds', 604800);

        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->never())->method('findByFileKey');
        $repository->expects($this->never())->method('create');
        $subscriber = $this->createSubscriber($this->createCleanupService($repository));

        $subscriber->process($this->createVideoEvent('ORG001', null));
        $subscriber->process($this->createVideoEvent(
            'ORG001',
            'OTHER/open/private-hash/open/video-generation/op-2.mp4'
        ));
    }

    /**
     * @dataProvider disabledExpireSecondsProvider
     */
    public function testDoesNotRegisterVideoWhenCleanupIsDisabled(int $expireSeconds): void
    {
        $this->config->set('model_gateway.video_file_cleanup.expire_seconds', $expireSeconds);

        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->expects($this->never())->method('findByFileKey');
        $repository->expects($this->never())->method('create');

        $event = $this->createVideoEvent(
            'ORG001',
            'ORG001/open/' . md5(StorageBucketType::Private->value) . '/open/video-generation/op-3.mp4'
        );

        $this->createSubscriber($this->createCleanupService($repository))->process($event);
    }

    public function testVideoRegistrationFailureDoesNotBreakEventProcessing(): void
    {
        $this->config->set('model_gateway.video_file_cleanup.expire_seconds', 604800);

        $repository = $this->createMock(FileCleanupRecordRepository::class);
        $repository->method('findByFileKey')->willReturn(null);
        $repository->method('create')->willThrowException(new RuntimeException('cleanup storage unavailable'));

        $event = $this->createVideoEvent(
            'ORG001',
            'ORG001/open/' . md5(StorageBucketType::Private->value) . '/open/video-generation/op-4.mp4'
        );

        $this->createSubscriber($this->createCleanupService($repository))->process($event);

        $this->addToAssertionCount(1);
    }

    private function createEvent(string $organizationCode, array $images, ?string $sourceId = null): ImageGeneratedEvent
    {
        $event = new ImageGeneratedEvent();
        $event->setOrganizationCode($organizationCode);
        $event->setGeneratedImages($images);
        $event->setSourceId($sourceId);
        return $event;
    }

    private function createVideoEvent(
        string $organizationCode,
        ?string $generatedFileKey,
        ?string $sourceId = null
    ): VideoGeneratedEvent {
        $event = new VideoGeneratedEvent();
        $event->setOrganizationCode($organizationCode);
        $event->setGeneratedFileKey($generatedFileKey);
        $event->setSourceId($sourceId);
        return $event;
    }

    private function createSubscriber(FileCleanupDomainService $cleanupService): GeneratedFileCleanupSubscriber
    {
        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->method('getLinks')
            ->willReturnCallback(static function (string $organizationCode, array $filePaths): array {
                $links = [];
                foreach ($filePaths as $filePath) {
                    $links[$filePath] = new FileLink(
                        $filePath,
                        'https://files.example.com/' . $filePath,
                        time() + 3600
                    );
                }
                return $links;
            });

        return new GeneratedFileCleanupSubscriber(
            $cleanupService,
            new FileDomainService($cloudFileRepository),
            new NullLogger()
        );
    }

    private function createCleanupService(FileCleanupRecordRepository $repository): FileCleanupDomainService
    {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());
        return new FileCleanupDomainService(
            $repository,
            $this->createMock(CloudFileRepositoryInterface::class),
            $loggerFactory
        );
    }
}
