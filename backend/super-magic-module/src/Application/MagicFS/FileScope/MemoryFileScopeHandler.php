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
use Dtyq\SuperMagic\ErrorCode\MagicFSErrorCode;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Request\ListFilesRequestDTO;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Response\ListFilesResponseDTO;
use Dtyq\SuperMagic\Interfaces\MagicFS\DTO\Response\MagicFSFileDTO;

/**
 * 文件记忆作用域处理器。
 */
final class MemoryFileScopeHandler implements FileScopeHandlerInterface
{
    public const string SCOPE = 'memory';

    /**
     * 注入文件记忆访问与文件领域服务。
     */
    public function __construct(
        private readonly FileMemoryAccessService $fileMemoryAccessService,
        private readonly MagicFSFileDomainService $magicFSFileDomainService,
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
