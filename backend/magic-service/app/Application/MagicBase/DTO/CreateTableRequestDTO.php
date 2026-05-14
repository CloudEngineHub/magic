<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDefinitionCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseDynamicPermissions;

class CreateTableRequestDTO
{
    public function __construct(
        public string $tableKey,
        public string $tableName,
        public MagicBaseColumnDefinitionCollection $columns,
        public MagicBaseDynamicPermissions $dynamicPermissions,
        public string $description = '',
        public string $projectName = '',
    ) {
    }

    /**
     * @return array{
     *     table_key: string,
     *     table_name: string,
     *     columns: list<array<string, mixed>>,
     *     dynamic_permissions: array<string, mixed>,
     *     description: string,
     *     project_name: string
     * }
     */
    public function toArray(): array
    {
        return [
            'table_key' => $this->tableKey,
            'table_name' => $this->tableName,
            'columns' => $this->columns->toArray(),
            'dynamic_permissions' => $this->dynamicPermissions->toArray(),
            'description' => $this->description,
            'project_name' => $this->projectName,
        ];
    }
}
