<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Infrastructure\Utils;

use InvalidArgumentException;

class FileOperationTreeUtil
{
    /**
     * Build an operation tree that includes the selected files' parent chain.
     *
     * @param array<int, array<string, mixed>> $files
     * @param array<int> $operationFileIds
     * @return array<int, array<string, mixed>>
     */
    public static function assemblePreservingParentPath(
        array $files,
        array $operationFileIds,
        int $sourceRootFileId
    ): array {
        $operationIdSet = array_fill_keys(array_map('intval', $operationFileIds), true);
        $preparedFiles = [];

        foreach ($files as $file) {
            $fileId = (int) ($file['file_id'] ?? 0);
            if ($fileId <= 0 || $fileId === $sourceRootFileId) {
                continue;
            }

            $isSyntheticParent = ! isset($operationIdSet[$fileId]);
            if ($isSyntheticParent && ! (bool) ($file['is_directory'] ?? false)) {
                throw new InvalidArgumentException(sprintf('Non-directory ancestor found: %d', $fileId));
            }

            $file['is_synthetic_parent'] = $isSyntheticParent;
            $preparedFiles[] = $file;
        }

        return FileTreeUtil::assembleFilesTreeByParentId($preparedFiles);
    }
}
