<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperAgent\Service;

use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\SuperMagic\Application\SuperAgent\Service\FileManagementAppService;
use Dtyq\SuperMagic\Domain\FileCollection\Entity\FileCollectionItemEntity;
use Dtyq\SuperMagic\Domain\FileCollection\Service\FileCollectionDomainService;
use Dtyq\SuperMagic\Domain\Share\Constant\ResourceType;
use Dtyq\SuperMagic\Domain\Share\Entity\ResourceShareEntity;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TopicEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Event\FilesBatchDeletedEvent;
use Dtyq\SuperMagic\Domain\SuperAgent\Event\FileUploadedEvent;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TaskFileDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TopicDomainService;
use Hyperf\Context\ApplicationContext;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Log\LoggerInterface;
use ReflectionClass;
use ReflectionMethod;
use ReflectionProperty;
use RuntimeException;

/**
 * @internal
 */
class FileManagementAppServiceTest extends TestCase
{
    private ?ContainerInterface $originalContainer = null;

    private bool $hadContainer = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hadContainer = ApplicationContext::hasContainer();
        $this->originalContainer = $this->hadContainer ? ApplicationContext::getContainer() : null;
    }

    protected function tearDown(): void
    {
        if ($this->hadContainer && $this->originalContainer !== null) {
            ApplicationContext::setContainer($this->originalContainer);
        } elseif (! $this->hadContainer) {
            $containerProperty = new ReflectionProperty(ApplicationContext::class, 'container');
            $containerProperty->setAccessible(true);
            $containerProperty->setValue(null, null);
        }

        parent::tearDown();
    }

    public function testDispatchFileUploadedEventUsesPersistedFileEntity(): void
    {
        $dispatcher = $this->createMock(EventDispatcherInterface::class);
        $dispatcher->expects($this->once())
            ->method('dispatch')
            ->with($this->callback(static function (object $event): bool {
                return $event instanceof FileUploadedEvent
                    && $event->getFileEntity()->getFileId() === 501
                    && $event->getFileEntity()->getFileKey() === '/workspace/hh.md'
                    && $event->getUserId() === 'U1'
                    && $event->getOrganizationCode() === 'ORG1';
            }))
            ->willReturnArgument(0);

        $this->createService($dispatcher)->dispatchOne(
            $this->createTaskFileEntity(501, '/workspace/hh.md'),
            $this->createAuthorization('U1', 'ORG1')
        );
    }

    public function testDispatchFileUploadedEventsDispatchesEveryPersistedFileAndSkipsNull(): void
    {
        $dispatchedFileIds = [];
        $dispatcher = $this->createMock(EventDispatcherInterface::class);
        $dispatcher->expects($this->exactly(2))
            ->method('dispatch')
            ->with($this->callback(static function (object $event) use (&$dispatchedFileIds): bool {
                if (! $event instanceof FileUploadedEvent) {
                    return false;
                }

                $dispatchedFileIds[] = $event->getFileEntity()->getFileId();
                return $event->getUserId() === 'U1'
                    && $event->getOrganizationCode() === 'ORG1';
            }))
            ->willReturnArgument(0);

        $this->createService($dispatcher)->dispatchMany(
            [
                $this->createTaskFileEntity(501, '/workspace/a.md'),
                null,
                $this->createTaskFileEntity(502, '/workspace/b.md'),
            ],
            $this->createAuthorization('U1', 'ORG1')
        );

        $this->assertSame([501, 502], $dispatchedFileIds);
    }

    public function testDispatchFilesBatchDeletedEventSeparatesFilesAndDirectories(): void
    {
        $fileEntity = $this->createTaskFileEntity(501, '/workspace/a.md');
        $directoryEntity = $this->createTaskFileEntity(502, '/workspace/dir', true);

        $dispatcher = $this->createMock(EventDispatcherInterface::class);
        $dispatcher->expects($this->once())
            ->method('dispatch')
            ->with($this->callback(static function (object $event) use ($fileEntity, $directoryEntity): bool {
                return $event instanceof FilesBatchDeletedEvent
                    && $event->getProjectId() === 900
                    && $event->getFileEntities() === [$fileEntity]
                    && $event->getDirectoryEntities() === [$directoryEntity]
                    && $event->getFileIds() === [501, 502]
                    && $event->getUserId() === 'U1'
                    && $event->getOrganizationCode() === 'ORG1'
                    && $event->getUserAuthorization()->getId() === 'U1'
                    && $event->getUserAuthorization()->getOrganizationCode() === 'ORG1';
            }))
            ->willReturnArgument(0);

        $this->createService($dispatcher)->dispatchBatchDeleted(
            900,
            [$fileEntity, null, $directoryEntity],
            $this->createAuthorization('U1', 'ORG1')
        );
    }

    public function testDispatchFilesBatchDeletedEventSkipsWhenNoEntities(): void
    {
        $dispatcher = $this->createMock(EventDispatcherInterface::class);
        $dispatcher->expects($this->never())->method('dispatch');

        $this->createService($dispatcher)->dispatchBatchDeleted(
            900,
            [null],
            $this->createAuthorization('U1', 'ORG1')
        );
    }

    public function testBuildRelativeFilePathUsesParentChain(): void
    {
        $directoryEntity = $this->createTaskFileEntity(100, 'DT001/user/project_900/workspace/docs', true);
        $directoryEntity->setFileName('docs');
        $directoryEntity->setParentId(0);
        $directoryEntity->setProjectId(900);

        $fileEntity = $this->createTaskFileEntity(101, 'DT001/user/project_900/workspace/image.png');
        $fileEntity->setFileName('image.png');
        $fileEntity->setParentId(100);
        $fileEntity->setProjectId(900);

        $taskFileDomainService = $this->createMock(TaskFileDomainService::class);
        $taskFileDomainService->expects($this->once())
            ->method('getFilesWithParentsByIds')
            ->with([101], 900)
            ->willReturn([$fileEntity, $directoryEntity]);

        $service = $this->createService($this->createMock(EventDispatcherInterface::class));
        $this->setPrivateProperty($service, 'taskFileDomainService', $taskFileDomainService);

        $method = new ReflectionMethod(FileManagementAppService::class, 'buildRelativeFilePathForEntity');
        $method->setAccessible(true);

        $this->assertSame('/docs/image.png', $method->invoke($service, $fileEntity, 900));
    }

    public function testGetFileUrlsByAccessTokenFiltersFileCollectionScope(): void
    {
        $this->bindAccessToken('token-file-collection', 'share-file-collection');

        $shareEntity = (new ResourceShareEntity())
            ->setResourceId('77')
            ->setResourceType(ResourceType::FileCollection->value);

        $resourceShareDomainService = $this->createMock(ResourceShareDomainService::class);
        $resourceShareDomainService->expects($this->once())
            ->method('getValidShareById')
            ->with('share-file-collection')
            ->willReturn($shareEntity);

        $collectionItem = (new FileCollectionItemEntity())->setFileId('501');
        $fileCollectionDomainService = $this->createMock(FileCollectionDomainService::class);
        $fileCollectionDomainService->expects($this->once())
            ->method('getProjectIdByCollectionId')
            ->with(77)
            ->willReturn(900);
        $fileCollectionDomainService->method('getFilesByCollectionId')
            ->willReturnCallback(static fn (int $collectionId): array => $collectionId === 77 ? [$collectionItem] : []);

        $allowedFileEntity = $this->createTaskFileEntity(501, '/workspace/shared.md');
        $allowedFileEntity->setProjectId(900);

        $taskFileDomainService = $this->createMock(TaskFileDomainService::class);
        $taskFileDomainService->method('findFilesByProjectIdAndIds')
            ->willReturnCallback(static fn (int $projectId, array $ids): array => $projectId === 900 && $ids === [501] ? [$allowedFileEntity] : []);
        $taskFileDomainService->method('getFileUrlsByProjectId')
            ->willReturnCallback(static function (array $ids, int $projectId): array {
                return array_map(
                    static fn (int $id): array => ['file_id' => (string) $id, 'url' => sprintf('https://example.test/%d.md', $id)],
                    $ids
                );
            });

        $service = $this->createService($this->createMock(EventDispatcherInterface::class));
        $this->setPrivateProperty($service, 'resourceShareDomainService', $resourceShareDomainService);
        $this->setPrivateProperty($service, 'fileCollectionDomainService', $fileCollectionDomainService);
        $this->setPrivateProperty($service, 'taskFileDomainService', $taskFileDomainService);

        $this->assertSame(
            [['file_id' => '501', 'url' => 'https://example.test/501.md']],
            $service->getFileUrlsByAccessToken([501, 999], 'token-file-collection', 'preview')
        );
    }

    public function testGetFileUrlsByAccessTokenFiltersTopicScope(): void
    {
        $this->bindAccessToken('token-topic', 'share-topic');

        $shareEntity = (new ResourceShareEntity())
            ->setResourceId('88')
            ->setResourceType(ResourceType::Topic->value);

        $resourceShareDomainService = $this->createMock(ResourceShareDomainService::class);
        $resourceShareDomainService->expects($this->once())
            ->method('getValidShareById')
            ->with('share-topic')
            ->willReturn($shareEntity);

        $topicEntity = new TopicEntity([
            'id' => 88,
            'project_id' => 900,
        ]);
        $topicDomainService = $this->createMock(TopicDomainService::class);
        $topicDomainService->expects($this->once())
            ->method('getTopicWithDeleted')
            ->with(88)
            ->willReturn($topicEntity);

        $allowedFileEntity = $this->createTaskFileEntity(501, '/workspace/topic.md');
        $allowedFileEntity->setProjectId(900);

        $taskFileDomainService = $this->createMock(TaskFileDomainService::class);
        $taskFileDomainService->method('findUserFilesByTopicId')
            ->willReturnCallback(static fn (string $topicId): array => $topicId === '88' ? [$allowedFileEntity] : []);
        $taskFileDomainService->method('getFileUrlsByProjectId')
            ->willReturnCallback(static function (array $ids, int $projectId): array {
                return array_map(
                    static fn (int $id): array => ['file_id' => (string) $id, 'url' => sprintf('https://example.test/%d.md', $id)],
                    $ids
                );
            });

        $service = $this->createService($this->createMock(EventDispatcherInterface::class));
        $this->setPrivateProperty($service, 'resourceShareDomainService', $resourceShareDomainService);
        $this->setPrivateProperty($service, 'topicDomainService', $topicDomainService);
        $this->setPrivateProperty($service, 'taskFileDomainService', $taskFileDomainService);

        $this->assertSame(
            [['file_id' => '501', 'url' => 'https://example.test/501.md']],
            $service->getFileUrlsByAccessToken([501, 999], 'token-topic', 'preview')
        );
    }

    private function createService(EventDispatcherInterface $dispatcher): TestableFileManagementAppService
    {
        $reflectionClass = new ReflectionClass(TestableFileManagementAppService::class);
        /** @var TestableFileManagementAppService $service */
        $service = $reflectionClass->newInstanceWithoutConstructor();

        $this->setPrivateProperty($service, 'eventDispatcher', $dispatcher);
        $this->setPrivateProperty($service, 'logger', $this->createMock(LoggerInterface::class));

        return $service;
    }

    private function setPrivateProperty(TestableFileManagementAppService $service, string $propertyName, mixed $value): void
    {
        $property = new ReflectionProperty(FileManagementAppService::class, $propertyName);
        $property->setAccessible(true);
        $property->setValue($service, $value);
    }

    private function createAuthorization(string $userId, string $organizationCode): MagicUserAuthorization
    {
        return (new MagicUserAuthorization())
            ->setId($userId)
            ->setOrganizationCode($organizationCode);
    }

    private function createTaskFileEntity(int $fileId, string $fileKey, bool $isDirectory = false): TaskFileEntity
    {
        $entity = new TaskFileEntity();
        $entity->setFileId($fileId);
        $entity->setFileKey($fileKey);
        $entity->setFileName(basename($fileKey));
        $entity->setFileExtension((string) pathinfo($fileKey, PATHINFO_EXTENSION));
        $entity->setIsDirectory($isDirectory);
        $entity->setSource(0);

        return $entity;
    }

    private function bindAccessToken(string $token, string $shareId): void
    {
        $redis = new FileManagementAccessTokenRedis([
            'super_magic_access_token:' . $token => json_encode([
                'share_id' => $shareId,
                'scope' => 'read',
                'created_at' => time(),
                'expires_at' => time() + 3600,
                'metadata' => [],
                'organization_code' => 'ORG1',
            ], JSON_THROW_ON_ERROR),
        ]);

        ApplicationContext::setContainer(new FileManagementAccessTokenTestContainer(
            $redis,
            $this->originalContainer
        ));
    }
}

final class FileManagementAccessTokenRedis extends Redis
{
    /**
     * @param array<string, string> $tokenValues
     */
    public function __construct(private readonly array $tokenValues)
    {
    }

    public function __call($name, $arguments)
    {
        if ($name === 'get') {
            return $this->tokenValues[(string) ($arguments[0] ?? '')] ?? null;
        }

        throw new RuntimeException("Redis command {$name} is not supported in this test");
    }
}

final readonly class FileManagementAccessTokenTestContainer implements ContainerInterface
{
    public function __construct(
        private Redis $redis,
        private ?ContainerInterface $fallbackContainer = null
    ) {
    }

    public function get(string $id): mixed
    {
        if ($id === Redis::class) {
            return $this->redis;
        }

        if ($this->fallbackContainer !== null) {
            return $this->fallbackContainer->get($id);
        }

        throw new RuntimeException("Container binding not found for {$id}");
    }

    public function has(string $id): bool
    {
        return $id === Redis::class || ($this->fallbackContainer !== null && $this->fallbackContainer->has($id));
    }
}

class TestableFileManagementAppService extends FileManagementAppService
{
    public function dispatchOne(?TaskFileEntity $fileEntity, MagicUserAuthorization $authorization): void
    {
        $this->dispatchFileUploadedEvent($fileEntity, $authorization);
    }

    /**
     * @param array<int, null|TaskFileEntity> $fileEntities
     */
    public function dispatchMany(array $fileEntities, MagicUserAuthorization $authorization): void
    {
        $this->dispatchFileUploadedEvents($fileEntities, $authorization);
    }

    /**
     * @param array<int, null|TaskFileEntity> $entities
     */
    public function dispatchBatchDeleted(int $projectId, array $entities, MagicUserAuthorization $authorization): void
    {
        $this->dispatchFilesBatchDeletedEvent($projectId, $entities, $authorization);
    }
}
