<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\MagicFS\FileScope;

use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\SuperMagic\Application\MagicFS\Service\FileMemoryAccessService;
use Dtyq\SuperMagic\Domain\MagicFS\Service\MagicFSFileDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\StorageType;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TaskFileDomainService;
use Dtyq\SuperMagic\ErrorCode\MagicFSErrorCode;
use Dtyq\SuperMagic\Infrastructure\Utils\FileTreeBuilder;
use Dtyq\SuperMagic\Infrastructure\Utils\RelativeFilePathUtil;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Request\ListFilesRequestDTO;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Response\ListFilesResponseDTO;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Response\MagicFSFileDTO;
use Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\Request\GetProjectAttachmentsRequestDTO;
use Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\Request\GetProjectAttachmentsV2RequestDTO;
use Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\Response\TaskFileItemDTO;

/**
 * 文件记忆作用域处理器。
 */
final class MemoryFileScopeHandler implements FileScopeHandlerInterface
{
    public const string SCOPE = 'memory';

    private const int MAX_V2_PARENT_QUERIES = 1000;

    /**
     * 注入文件记忆访问、文件查询与树构建能力。
     */
    public function __construct(
        private readonly FileMemoryAccessService $fileMemoryAccessService,
        private readonly MagicFSFileDomainService $magicFSFileDomainService,
        private readonly TaskFileDomainService $taskFileDomainService,
        private readonly FileTreeBuilder $fileTreeBuilder,
    ) {
    }

    /**
     * 列出当前用户的记忆目录入口或记忆目录中的直接子节点。
     */
    public function listFiles(
        MagicUserAuthorization $authorization,
        ListFilesRequestDTO $requestDTO,
    ): ListFilesResponseDTO {
        $responseDTO = new ListFilesResponseDTO();
        if ($requestDTO->parent_id === '' || $requestDTO->parent_id === '0') {
            $memoryRoot = $this->fileMemoryAccessService->getOrCreateMemoryRoot($authorization);
            $responseDTO->files = [MagicFSFileDTO::fromTaskFileEntity($memoryRoot)];
            return $responseDTO;
        }

        $this->assertValidParentId($requestDTO->parent_id);
        $parent = $this->fileMemoryAccessService->getAccessibleDirectory(
            $authorization,
            $requestDTO->parent_id,
        );

        $fileEntities = $this->magicFSFileDomainService->listFilesByParentId(
            (string) $parent->getFileId(),
            StorageType::WORKSPACE->value,
        );
        $fileEntities = array_values(array_filter(
            $fileEntities,
            fn (TaskFileEntity $entity): bool => $entity->getParentId() === $parent->getFileId()
                && $this->fileMemoryAccessService->belongsToCurrentUserSpace($entity, $authorization),
        ));

        $responseDTO->files = array_map(
            static fn (TaskFileEntity $entity): MagicFSFileDTO => MagicFSFileDTO::fromTaskFileEntity($entity),
            $fileEntities,
        );

        return $responseDTO;
    }

    /**
     * 按项目附件 V1 协议返回记忆目录及完整子树。
     */
    public function listProjectAttachments(
        MagicUserAuthorization $authorization,
        GetProjectAttachmentsRequestDTO $requestDTO,
    ): array {
        $root = $this->resolveTraversalRoot($authorization, $requestDTO->getParentId());
        $entities = $this->getMemoryTreeEntities($authorization, $root);
        $entities = array_values(array_filter(
            $entities,
            fn (TaskFileEntity $entity): bool => $this->matchesFileType(
                $entity,
                $requestDTO->getFileType(),
                $root->getFileId(),
            ),
        ));

        $fileMap = RelativeFilePathUtil::indexByFileId($entities);
        $relativePathMap = RelativeFilePathUtil::buildPathMapByParentChain($entities, $fileMap);
        $list = array_map(
            static fn (TaskFileEntity $entity): array => TaskFileItemDTO::fromEntity(
                $entity,
                '',
                $relativePathMap[$entity->getFileId()] ?? '',
            )->toArray(),
            $entities,
        );

        return [
            'total' => count($list),
            'list' => $list,
            'tree' => $this->fileTreeBuilder->buildTree($list, null, 'zh_CN'),
        ];
    }

    /**
     * 按项目附件 V2 协议分页遍历记忆目录。
     */
    public function listProjectAttachmentsV2(
        MagicUserAuthorization $authorization,
        GetProjectAttachmentsV2RequestDTO $requestDTO,
    ): array {
        $queue = $requestDTO->getNextParentIds();
        $list = [];
        $remaining = $requestDTO->getPageSize();
        $parentQueryCount = 0;

        if ($queue === []) {
            $root = $this->resolveTraversalRoot($authorization, $requestDTO->getParentId());
            $list[] = $this->formatAttachmentRowV2($root->toArray());
            --$remaining;
            $queue[] = $this->makeParentState((string) $root->getFileId());
        } else {
            $this->assertAccessibleTraversalQueue($authorization, $queue);
        }

        while ($remaining > 0 && $queue !== [] && $parentQueryCount < self::MAX_V2_PARENT_QUERIES) {
            $state = array_shift($queue);
            $parentId = (int) ($state['parent_id'] ?? 0);
            if ($parentId <= 0) {
                continue;
            }

            ++$parentQueryCount;
            $rows = $this->taskFileDomainService->getProjectFileChildrenByParentCursor(
                0,
                $parentId,
                StorageType::WORKSPACE->value,
                $state['after_sort'] ?? null,
                isset($state['after_file_id']) ? (int) $state['after_file_id'] : null,
                $remaining + 1,
                $requestDTO->getFileType(),
            );
            $rows = array_map(static fn (mixed $row): array => (array) $row, $rows);
            $rows = array_values(array_filter(
                $rows,
                fn (array $row): bool => $this->belongsToCurrentUserSpaceRow($row, $authorization),
            ));

            $rowsToEmit = array_slice($rows, 0, $remaining);
            $lastEmittedRow = null;
            foreach ($rowsToEmit as $row) {
                $lastEmittedRow = $row;
                $list[] = $this->formatAttachmentRowV2($row);
                --$remaining;

                if ((bool) ($row['is_directory'] ?? false)) {
                    $childParentId = (string) ($row['file_id'] ?? '');
                    if ($childParentId !== '' && $childParentId !== (string) $parentId) {
                        $queue[] = $this->makeParentState($childParentId);
                    }
                }
            }

            if (count($rows) > count($rowsToEmit) && $lastEmittedRow !== null) {
                array_unshift(
                    $queue,
                    $this->makeParentState(
                        (string) $parentId,
                        (int) ($lastEmittedRow['sort'] ?? 0),
                        (string) ($lastEmittedRow['file_id'] ?? ''),
                    ),
                );
                break;
            }
        }

        return [
            'list' => $list,
            'next_parent_ids' => array_values($queue),
            'has_more' => $queue !== [],
        ];
    }

    /**
     * 统计当前用户记忆目录及其全部后代节点数量。
     */
    public function countProjectAttachments(MagicUserAuthorization $authorization): array
    {
        $root = $this->fileMemoryAccessService->getOrCreateMemoryRoot($authorization);

        return [
            'total' => count($this->getMemoryTreeEntities($authorization, $root)),
        ];
    }

    /**
     * 获取当前用户记忆目录树中的全部可访问节点。
     *
     * @return array<TaskFileEntity>
     */
    private function getMemoryTreeEntities(
        MagicUserAuthorization $authorization,
        TaskFileEntity $root,
    ): array {
        $fileTree = $this->magicFSFileDomainService->getFileTree(
            (string) $root->getFileId(),
            -1,
            0,
            StorageType::WORKSPACE->value,
        );

        return array_values(array_filter(
            array_merge([$root], $fileTree['children'] ?? []),
            fn (TaskFileEntity $entity): bool => $this->fileMemoryAccessService
                ->belongsToCurrentUserSpace($entity, $authorization),
        ));
    }

    /**
     * 解析本次查询的记忆目录遍历根节点。
     */
    private function resolveTraversalRoot(
        MagicUserAuthorization $authorization,
        ?string $parentId,
    ): TaskFileEntity {
        if ($parentId === null || $parentId === '') {
            return $this->fileMemoryAccessService->getOrCreateMemoryRoot($authorization);
        }

        $this->assertValidParentId($parentId);
        return $this->fileMemoryAccessService->getAccessibleDirectory($authorization, $parentId);
    }

    /**
     * 批量校验 V2 游标中的目录均属于当前用户记忆子树。
     *
     * @param array<int, array{parent_id: string, after_sort: null|int, after_file_id: null|string}> $queue
     */
    private function assertAccessibleTraversalQueue(
        MagicUserAuthorization $authorization,
        array $queue,
    ): void {
        $parentIds = [];
        foreach ($queue as $state) {
            $parentId = (string) ($state['parent_id'] ?? '');
            $this->assertValidParentId($parentId);
            $parentIds[(int) $parentId] = (int) $parentId;
        }

        $directories = $this->taskFileDomainService->getFilesByIds(array_values($parentIds));
        $directoryMap = [];
        foreach ($directories as $directory) {
            $directoryMap[$directory->getFileId()] = $directory;
        }

        foreach ($parentIds as $parentId) {
            $directory = $directoryMap[$parentId] ?? null;
            if ($directory === null || ! $directory->getIsDirectory()) {
                ExceptionBuilder::throw(
                    MagicFSErrorCode::PARENT_DIRECTORY_NOT_FOUND,
                    'magicfs.parent_directory_not_found',
                    ['parent_id' => (string) $parentId],
                );
            }
        }

        $this->fileMemoryAccessService->assertAccessibleNodes($authorization, array_values($directoryMap));
    }

    /**
     * 判断文件是否满足附件类型过滤条件，目录节点始终保留以维持树结构。
     *
     * @param string[] $fileTypes
     */
    private function matchesFileType(TaskFileEntity $entity, array $fileTypes, int $rootId): bool
    {
        return $entity->getFileId() === $rootId
            || $entity->getIsDirectory()
            || $fileTypes === []
            || in_array($entity->getFileType(), $fileTypes, true);
    }

    /**
     * 判断原始查询行是否属于当前用户文件空间。
     */
    private function belongsToCurrentUserSpaceRow(
        array $row,
        MagicUserAuthorization $authorization,
    ): bool {
        return (int) ($row['project_id'] ?? -1) === 0
            && (string) ($row['space_type'] ?? '') === 'user'
            && (string) ($row['user_id'] ?? '') === $authorization->getId()
            && (string) ($row['organization_code'] ?? '') === $authorization->getOrganizationCode();
    }

    /**
     * 将文件实体或查询行转换为项目附件 V2 响应格式。
     */
    private function formatAttachmentRowV2(array $row): array
    {
        $item = TaskFileItemDTO::fromArray($row)->toArray();
        $item['file_url'] = '';
        unset($item['relative_file_path']);

        return $item;
    }

    /**
     * 创建 V2 广度优先遍历游标。
     *
     * @return array{parent_id: string, after_sort: null|int, after_file_id: null|string}
     */
    private function makeParentState(
        string $parentId,
        ?int $afterSort = null,
        ?string $afterFileId = null,
    ): array {
        return [
            'parent_id' => $parentId,
            'after_sort' => $afterSort,
            'after_file_id' => $afterFileId === '' ? null : $afterFileId,
        ];
    }

    /**
     * 校验记忆目录编号格式。
     */
    private function assertValidParentId(string $parentId): void
    {
        if (preg_match('/^[1-9][0-9]*$/', $parentId) === 1) {
            return;
        }

        ExceptionBuilder::throw(
            MagicFSErrorCode::PARENT_DIRECTORY_NOT_FOUND,
            'magicfs.parent_directory_not_found',
            ['parent_id' => $parentId],
        );
    }
}
