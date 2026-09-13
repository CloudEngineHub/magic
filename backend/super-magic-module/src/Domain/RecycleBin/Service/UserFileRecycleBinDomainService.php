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
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileRepositoryInterface;
use Dtyq\SuperMagic\Infrastructure\Utils\RelativeFilePathUtil;
use Hyperf\DbConnection\Db;
use InvalidArgumentException;

/** 个人文件沿用回收站的记录接口；项目删除事件继续由原订阅者处理。 */
class UserFileRecycleBinDomainService
{
    public function __construct(
        private readonly RecycleBinDomainService $recycleBinDomainService,
        private readonly TaskFileRepositoryInterface $taskFileRepository,
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
        $paths = $this->buildRelativePathMap($files, $first->getProjectId());
        foreach ($files as $file) {
            $this->recordFileDeletion($file, $deletedBy, $source, $paths[$file->getFileId()] ?? null, $groupId);
        }
    }

    public function recordFileDeletion(
        TaskFileEntity $fileEntity,
        string $deletedBy,
        DeleteEventSource $source,
        ?string $relativeFilePath = null,
        string $groupId = '',
    ): void {
        if ($fileEntity->isProjectFile() || $fileEntity->getSpaceType() !== 'user') {
            throw new InvalidArgumentException('Only personal files use this recycle bin adapter');
        }
        $fileId = (int) $fileEntity->getFileId();
        if ($fileId <= 0) {
            return;
        }

        Db::transaction(function () use ($fileEntity, $deletedBy, $source, $relativeFilePath, $groupId, $fileId): void {
            // 个人文件的删除记录与恢复共用文件行锁，避免并发写出重复回收记录。
            $locked = $this->taskFileRepository->lockByIds([$fileId]);
            if (! isset($locked[$fileId]) || $locked[$fileId]->getDeletedAt() === null) {
                return;
            }
            $existing = $this->recycleBinDomainService->findByResource(RecycleBinResourceType::File, $fileId);
            if ($existing !== null) {
                return;
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
                parentId: null,
                extraData: [
                    'space_type' => 'user',
                    'organization_code' => $fileEntity->getOrganizationCode(),
                    'deletion_group_id' => $groupId !== '' ? $groupId : (string) IdGenerator::getSnowId(),
                    'delete_source' => $source->value,
                    'is_directory' => $fileEntity->getIsDirectory(),
                    'file_key' => $fileEntity->getFileKey(),
                    'storage_type' => $fileEntity->getStorageType()->value,
                    'source' => $fileEntity->getSource()->value,
                    'original_parent_id' => $originalParentId,
                    'original_parent_name' => $originalParentName,
                    'relative_file_path' => $relativeFilePath,
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
