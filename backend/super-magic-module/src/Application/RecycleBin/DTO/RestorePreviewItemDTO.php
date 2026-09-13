<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\RecycleBin\DTO;

class RestorePreviewItemDTO
{
    public function __construct(
        public readonly string $resourceId,
        public readonly string $resourceName,
        public readonly bool $isDirectory,
        public readonly ?RestoreConflictDTO $conflict = null,
        public readonly string $spaceType = 'project',
    ) {
    }

    public function hasConflict(): bool
    {
        return $this->conflict !== null;
    }

    public function toArray(): array
    {
        $data = [
            'resource_id' => $this->resourceId,
            'resource_name' => $this->resourceName,
            'is_directory' => $this->isDirectory,
        ];

        // 个人文件需要标明恢复位置所属空间；项目响应保持原有字段。
        if ($this->spaceType === 'user') {
            $data['space_type'] = $this->spaceType;
        }

        if ($this->conflict !== null) {
            $data['conflict'] = $this->conflict->toArray();
        }

        return $data;
    }
}
