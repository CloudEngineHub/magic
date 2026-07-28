<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Domain\SuperAgent\Service;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Infrastructure\Util\Locker\LockerInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\TaskFileSource;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectForkRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileVersionRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TopicRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\WorkspaceVersionRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\AgentDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TaskFileDomainService;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\Gateway\SandboxGatewayInterface;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Container\NotFoundExceptionInterface;
use Psr\Log\NullLogger;
use Psr\SimpleCache\CacheInterface;
use ReflectionProperty;
use RuntimeException;

/**
 * @internal
 */
class TaskFileDomainServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $config = $this->createMock(ConfigInterface::class);
        $config->method('get')->willReturnMap([
            ['app_env', null, 'testing'],
            ['app_name', null, 'magic'],
        ]);

        ApplicationContext::setContainer(new class($config) implements ContainerInterface {
            public function __construct(private readonly ConfigInterface $config)
            {
            }

            public function get(string $id)
            {
                if ($id === ConfigInterface::class) {
                    return $this->config;
                }

                throw new class(sprintf('Service %s not found.', $id)) extends RuntimeException implements NotFoundExceptionInterface {
                };
            }

            public function has(string $id): bool
            {
                return $id === ConfigInterface::class;
            }
        });
    }

    protected function tearDown(): void
    {
        $reflectionProperty = new ReflectionProperty(ApplicationContext::class, 'container');
        $reflectionProperty->setAccessible(true);
        $reflectionProperty->setValue(null, null);

        parent::tearDown();
    }

    public function testSaveProjectFilePreservesExistingAiGeneratedSource(): void
    {
        $existingEntity = $this->makeExistingFileEntity(TaskFileSource::AI_IMAGE_GENERATION);
        $incomingEntity = $this->makeIncomingFileEntity(TaskFileSource::AGENT);

        $repository = $this->createMock(TaskFileRepositoryInterface::class);
        $repository->method('getByFileKey')->willReturn($existingEntity);
        $repository->expects($this->once())
            ->method('insertOrUpdate')
            ->with($this->callback(function (TaskFileEntity $entity): bool {
                return $entity->getSource() === TaskFileSource::AI_IMAGE_GENERATION;
            }))
            ->willReturnCallback(fn (TaskFileEntity $entity): TaskFileEntity => $entity);

        $service = $this->createService($repository);
        $service->saveProjectFile(
            DataIsolation::simpleMake('org-code', 'user-id'),
            $this->makeProjectEntity(),
            $incomingEntity
        );
    }

    public function testSaveProjectFilePromotesIncomingAiGeneratedSource(): void
    {
        $existingEntity = $this->makeExistingFileEntity(TaskFileSource::AGENT);
        $incomingEntity = $this->makeIncomingFileEntity(TaskFileSource::AI_VIDEO_GENERATION);

        $repository = $this->createMock(TaskFileRepositoryInterface::class);
        $repository->method('getByFileKey')->willReturn($existingEntity);
        $repository->expects($this->once())
            ->method('insertOrUpdate')
            ->with($this->callback(function (TaskFileEntity $entity): bool {
                return $entity->getSource() === TaskFileSource::AI_VIDEO_GENERATION;
            }))
            ->willReturnCallback(fn (TaskFileEntity $entity): TaskFileEntity => $entity);

        $service = $this->createService($repository);
        $service->saveProjectFile(
            DataIsolation::simpleMake('org-code', 'user-id'),
            $this->makeProjectEntity(),
            $incomingEntity
        );
    }

    public function testGetFileInfoFromCloudStorageReadsSizeForOpaqueFileKey(): void
    {
        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->expects($this->once())
            ->method('getHeadObjectByCredential')
            ->with('org-code', '/workspace/940615004084371457')
            ->willReturn(['content_length' => 48]);

        $service = $this->createService(
            $this->createMock(TaskFileRepositoryInterface::class),
            $cloudFileRepository
        );

        $fileInfo = $service->getFileInfoFromCloudStorage(
            '1122.txt',
            '/workspace/940615004084371457',
            'org-code'
        );

        $this->assertSame(48, $fileInfo['size']);
    }

    public function testGetFileInfoFromCloudStorageSkipsHeadForDirectoryName(): void
    {
        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->expects($this->never())
            ->method('getHeadObjectByCredential');

        $service = $this->createService(
            $this->createMock(TaskFileRepositoryInterface::class),
            $cloudFileRepository
        );

        $fileInfo = $service->getFileInfoFromCloudStorage(
            'directory-without-trailing-slash',
            '/workspace/opaque-directory-key',
            'org-code'
        );

        $this->assertSame(0, $fileInfo['size']);
    }

    public function testGetFileInfoFromCloudStorageReturnsZeroWhenHeadFails(): void
    {
        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->expects($this->once())
            ->method('getHeadObjectByCredential')
            ->willThrowException(new RuntimeException('head failed'));

        $service = $this->createService(
            $this->createMock(TaskFileRepositoryInterface::class),
            $cloudFileRepository
        );

        $fileInfo = $service->getFileInfoFromCloudStorage(
            'opaque-file.txt',
            '/workspace/opaque-file-key',
            'org-code'
        );

        $this->assertSame(0, $fileInfo['size']);
    }

    private function createService(
        TaskFileRepositoryInterface $taskFileRepository,
        ?CloudFileRepositoryInterface $cloudFileRepository = null
    ): TaskFileDomainService
    {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());

        return new TaskFileDomainService(
            $this->createMock(TaskRepositoryInterface::class),
            $taskFileRepository,
            $this->createMock(WorkspaceVersionRepositoryInterface::class),
            $this->createMock(TopicRepositoryInterface::class),
            $cloudFileRepository ?? $this->createMock(CloudFileRepositoryInterface::class),
            $this->createMock(ProjectRepositoryInterface::class),
            $this->createMock(ProjectForkRepositoryInterface::class),
            $this->createMock(SandboxGatewayInterface::class),
            $this->createMock(LockerInterface::class),
            $this->createMock(TaskFileVersionRepositoryInterface::class),
            $this->createMock(CacheInterface::class),
            $this->createMock(AgentDomainService::class),
            $loggerFactory
        );
    }

    private function makeProjectEntity(): ProjectEntity
    {
        return (new ProjectEntity())
            ->setId(100)
            ->setUserOrganizationCode('org-code')
            ->setWorkDir('/workspace');
    }

    private function makeExistingFileEntity(TaskFileSource $source): TaskFileEntity
    {
        $entity = new TaskFileEntity();
        $entity->setFileId(1);
        $entity->setFileKey('/workspace/demo.png');
        $entity->setFileName('demo.png');
        $entity->setFileType('image');
        $entity->setParentId(10);
        $entity->setTaskId(11);
        $entity->setTopicId(12);
        $entity->setProjectId(100);
        $entity->setSource($source);
        $entity->setDeletedAt(null);

        return $entity;
    }

    private function makeIncomingFileEntity(TaskFileSource $source): TaskFileEntity
    {
        $entity = new TaskFileEntity();
        $entity->setFileKey('/workspace/demo.png');
        $entity->setFileName('demo.png');
        $entity->setFileType('image');
        $entity->setParentId(10);
        $entity->setTaskId(11);
        $entity->setTopicId(12);
        $entity->setIsDirectory(false);
        $entity->setSource($source);

        return $entity;
    }
}
