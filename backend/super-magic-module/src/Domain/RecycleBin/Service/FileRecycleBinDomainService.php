<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\RecycleBin\Service;

use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Dtyq\SuperMagic\Domain\RecycleBin\Enum\RecycleBinResourceType;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Event\DeleteEventSource;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\WorkspaceRepositoryInterface;
use Dtyq\SuperMagic\Infrastructure\Utils\RelativeFilePathUtil;
use Hyperf\DbConnection\Db;

/** 删除、替换与事件回调共用同一文件记录规则；调用方事务同时保护删除状态与回收记录。 */
class FileRecycleBinDomainService
{
    public function __construct(
        private readonly RecycleBinDomainService $recycleBinDomainService,
        private readonly TaskFileRepositoryInterface $taskFileRepository,
        private readonly ProjectRepositoryInterface $projectRepository,
        private readonly WorkspaceRepositoryInterface $workspaceRepository,
    ) {
    }

    /** @param list<TaskFileEntity> $files */
    public function recordFiles(array $files, string $deletedBy, DeleteEventSource $source, string $groupId = ''): void
    {
        if ($files === []) {
            return;
        }
        $first = $files[0];
        $groupId = $groupId !== '' ? $groupId : (string) IdGenerator::getSnowId();
        $rootId = $first->isProjectFile() ? null : $this->taskFileRepository->findUserSpaceRootDirectory($first->getUserId(), $first->getOrganizationCode())?->getFileId();
        $paths = $this->buildRelativePathMap($files, $first->getProjectId());
        foreach ($files as $file) {
            $this->recordFileDeletion($file, $deletedBy, $source, $paths[$file->getFileId()] ?? null, $groupId, $rootId);
        }
    }

    public function recordFileDeletion(
        TaskFileEntity $fileEntity,
        string $deletedBy,
        DeleteEventSource $source,
        ?string $relativeFilePath = null,
        string $groupId = '',
        ?int $rootId = null,
    ): void {
        $fileId = (int) $fileEntity->getFileId();
        if ($fileId <= 0) {
            return;
        }

        Db::transaction(function () use ($fileEntity, $deletedBy, $source, $relativeFilePath, $groupId, $rootId, $fileId): void {
            // 文件行是删除与回收记录的共同互斥点，事件重放不能插入第二条活跃记录。
            $locked = $this->taskFileRepository->lockByIds([$fileId]);
            if (! isset($locked[$fileId]) || $locked[$fileId]->getDeletedAt() === null) {
                return;
            }
            if (! $fileEntity->isProjectFile() && $rootId === null) {
                $rootId = $this->taskFileRepository->findUserSpaceRootDirectory($fileEntity->getUserId(), $fileEntity->getOrganizationCode())?->getFileId();
            }
            $existing = $this->recycleBinDomainService->findByResource(RecycleBinResourceType::File, $fileId);
            if ($existing !== null) {
                return;
            }

            $project = $fileEntity->isProjectFile() ? $this->projectRepository->findById($fileEntity->getProjectId()) : null;
            $workspace = null;
            if ($project !== null && $project->getWorkspaceId() !== null) {
                $workspace = $this->workspaceRepository->getWorkspaceById($project->getWorkspaceId());
            }

            $originalParentId = $fileEntity->getParentId();
            $originalParentName = '';
            if ($originalParentId !== null && $originalParentId > 0) {
                $parent = $this->taskFileRepository->getByIdWithTrash($originalParentId);
                $originalParentName = $parent?->getFileName() ?? '';
            }

            $relativeFilePath ??= $this->buildRelativeFilePath($fileEntity);

            $this->recycleBinDomainService->recordDeletion(
                resourceType: RecycleBinResourceType::File,
                resourceId: $fileId,
                resourceName: $fileEntity->getFileName(),
                ownerId: $fileEntity->getUserId(),
                deletedBy: $deletedBy,
                parentId: $fileEntity->isProjectFile() ? $fileEntity->getProjectId() : null,
                extraData: [
                    'space_type' => $fileEntity->isProjectFile() ? 'project' : 'user',
                    'organization_code' => $fileEntity->getOrganizationCode(),
                    'owner_id' => $fileEntity->getUserId(),
                    'space_root_id' => $rootId,
                    'deletion_group_id' => $groupId !== '' ? $groupId : (string) IdGenerator::getSnowId(),
                    'delete_source' => $source->value,
                    'is_directory' => $fileEntity->getIsDirectory(),
                    'file_key' => $fileEntity->getFileKey(),
                    'storage_type' => $fileEntity->getStorageType()->value,
                    'source' => $fileEntity->getSource()->value,
                    'original_parent_id' => $originalParentId,
                    'original_parent_name' => $originalParentName,
                    'relative_file_path' => $relativeFilePath,
                    'project_id' => $fileEntity->getProjectId(),
                    'project_name' => $project?->getProjectName() ?? '',
                    'workspace_id' => $project?->getWorkspaceId(),
                    'workspace_name' => $workspace?->getName() ?? '',
                ]
            );
        });
    }

    private function buildRelativeFilePath(TaskFileEntity $fileEntity): string
    {
        $pathMap = $this->buildRelativePathMap([$fileEntity], $fileEntity->getProjectId());

        return $pathMap[$fileEntity->getFileId()] ?? '/';
    }

    /**
     * @param TaskFileEntity[] $fileEntities
     * @return array<int, string>
     */
    private function buildRelativePathMap(array $fileEntities, int $projectId): array
    {
        if (empty($fileEntities)) {
            return [];
        }

        $parentIds = [];
        foreach ($fileEntities as $fileEntity) {
            $parentId = $fileEntity->getParentId();
            if ($parentId !== null && $parentId > 0) {
                $parentIds[$parentId] = $parentId;
            }
        }

        $filesWithParents = empty($parentIds)
            ? []
            : $this->taskFileRepository->getFilesWithParentsByIds(array_values($parentIds), $projectId);
        $fileMap = RelativeFilePathUtil::indexByFileId($filesWithParents);

        foreach ($fileEntities as $fileEntity) {
            $fileMap[$fileEntity->getFileId()] = $fileEntity;
        }

        return RelativeFilePathUtil::buildPathMapByParentChain($fileEntities, $fileMap);
    }
}
