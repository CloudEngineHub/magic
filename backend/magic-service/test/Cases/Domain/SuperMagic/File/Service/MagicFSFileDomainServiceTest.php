<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\SuperMagic\File\Service;

use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Entity\ValueObject\FileSpaceType;
use App\Domain\SuperMagic\File\Repository\Facade\TaskFileRepositoryInterface;
use App\Domain\SuperMagic\File\Service\MagicFSFileDomainService;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Domain\SuperMagic\Project\Repository\Facade\ProjectRepositoryInterface;
use App\Domain\SuperMagic\Task\Repository\Facade\TaskRepositoryInterface;
use App\Infrastructure\Core\Exception\BusinessException;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * 覆盖 magicfs createFile 的 file_key 构造：话题空间文件必须落在
 * {prefix}/project_{projectId}/runtime/topic_{topicId}/{fileId}。
 *
 * @internal
 */
class MagicFSFileDomainServiceTest extends TestCase
{
    public function testCreateFileUnderTopicSpaceParentUsesTopicRuntimeKey(): void
    {
        $parent = $this->parentEntity(500, FileSpaceType::TOPIC->value, 456);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->method('getById')->willReturn($parent);
        $taskFileRepository->method('getByProjectParentAndName')->willReturn(null);
        $taskFileRepository->method('insert')->willReturnArgument(0);

        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->method('getFullPrefix')->willReturn('DT001/open/');

        $entity = $this->service($taskFileRepository, null, $cloudFileRepository)
            ->createFile('hello.txt', '500', false, '', null, null, null, null, false, 456);

        $this->assertSame(
            'DT001/open/project_100/runtime/topic_456/' . $entity->getFileId(),
            $entity->getFileKey()
        );
        $this->assertSame(456, $entity->getTopicId());
        $this->assertSame(FileSpaceType::TOPIC->value, $entity->getSpaceType());
    }

    public function testCreateFileUnderTopicSpaceWithoutTopicIdThrows(): void
    {
        $parent = $this->parentEntity(500, FileSpaceType::TOPIC->value, 0);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->method('getById')->willReturn($parent);
        $taskFileRepository->method('getByProjectParentAndName')->willReturn(null);
        // 父目录缺失 topic_id 时直接失败，不查询祖先链
        $taskFileRepository->expects($this->never())
            ->method('getFilesWithParentsByIds');

        $this->expectException(BusinessException::class);

        $this->service($taskFileRepository)
            ->createFile('hello.txt', '500', true, '', null, null, null, null, false, 0);
    }

    public function testCreateFileUnderUnsupportedSpaceTypeThrows(): void
    {
        $parent = $this->parentEntity(500, 'weird');

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->method('getById')->willReturn($parent);
        $taskFileRepository->method('getByProjectParentAndName')->willReturn(null);

        $this->expectException(BusinessException::class);

        $this->service($taskFileRepository)
            ->createFile('hello.txt', '500', true, '', null, null, null, null, false, 0);
    }

    public function testCreateFileUnderProjectSpaceKeepsWorkspaceKey(): void
    {
        $parent = $this->parentEntity(500, FileSpaceType::PROJECT->value);

        $project = $this->createMock(ProjectEntity::class);
        $project->method('getWorkDir')->willReturn('/project_100/workspace');

        $projectRepository = $this->createMock(ProjectRepositoryInterface::class);
        $projectRepository->method('findById')->willReturn($project);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->method('getById')->willReturn($parent);
        $taskFileRepository->method('getByProjectParentAndName')->willReturn(null);
        $taskFileRepository->method('insert')->willReturnArgument(0);

        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->method('getFullPrefix')->willReturn('DT001/open/');

        $entity = $this->service($taskFileRepository, $projectRepository, $cloudFileRepository)
            ->createFile('hello.txt', '500', true, '', null, null, null, null, false, 0);

        $this->assertSame(
            'DT001/open/project_100/workspace/' . $entity->getFileId(),
            $entity->getFileKey()
        );
        $this->assertSame(0, $entity->getTopicId());
        $this->assertSame(FileSpaceType::PROJECT->value, $entity->getSpaceType());
    }

    public function testCreateFileUnderUserSpaceKeepsUserWorkspaceKey(): void
    {
        $parent = $this->parentEntity(500, FileSpaceType::USER->value, 0, 'sub', 0);

        $taskFileRepository = $this->createMock(TaskFileRepositoryInterface::class);
        $taskFileRepository->method('getById')->willReturn($parent);
        $taskFileRepository->method('getByProjectParentAndName')->willReturn(null);
        $taskFileRepository->method('insert')->willReturnArgument(0);

        $cloudFileRepository = $this->createMock(CloudFileRepositoryInterface::class);
        $cloudFileRepository->method('getFullPrefix')->willReturn('DT001/open/');

        $entity = $this->service($taskFileRepository, null, $cloudFileRepository)
            ->createFile('hello.txt', '500', true, '', null, null, null, null, false, 0);

        $this->assertSame(
            'DT001/open/user_user-1/workspace/' . $entity->getFileId(),
            $entity->getFileKey()
        );
        $this->assertSame(FileSpaceType::USER->value, $entity->getSpaceType());
    }

    private function parentEntity(int $fileId, string $spaceType, int $topicId = 0, string $fileName = 'sub', int $projectId = 100): TaskFileEntity
    {
        $parent = new TaskFileEntity();
        $parent->setFileId($fileId);
        $parent->setUserId('user-1');
        $parent->setOrganizationCode('DT001');
        $parent->setProjectId($projectId);
        $parent->setTopicId($topicId);
        $parent->setFileName($fileName);
        $parent->setIsDirectory(true);
        $parent->setParentId(50);
        if ($spaceType !== '') {
            $parent->setSpaceType($spaceType);
        }

        return $parent;
    }

    private function service(
        TaskFileRepositoryInterface $taskFileRepository,
        ?ProjectRepositoryInterface $projectRepository = null,
        ?CloudFileRepositoryInterface $cloudFileRepository = null
    ): MagicFSFileDomainService {
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($this->createMock(LoggerInterface::class));

        return new MagicFSFileDomainService(
            $taskFileRepository,
            $this->createMock(TaskRepositoryInterface::class),
            $cloudFileRepository ?? $this->createMock(CloudFileRepositoryInterface::class),
            $projectRepository ?? $this->createMock(ProjectRepositoryInterface::class),
            $loggerFactory
        );
    }
}
