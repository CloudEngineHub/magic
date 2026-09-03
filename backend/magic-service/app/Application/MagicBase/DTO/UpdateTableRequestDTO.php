<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseDynamicPermissions;

class UpdateTableRequestDTO
{
    public function __construct(
        public ?string $tableKey = null,
        public ?string $tableName = null,
        public ?MagicBaseDynamicPermissions $dynamicPermissions = null,
        public ?string $description = null,
    ) {
    }

    /**
     * @return array{
     *     table_key?: string,
     *     table_name?: string,
     *     dynamic_permissions?: array<string, mixed>,
     *     description?: string
     * }
     */
    public function toArray(): array
    {
        $payload = [];
        if ($this->tableKey !== null) {
            $payload['table_key'] = $this->tableKey;
        }
        if ($this->tableName !== null) {
            $payload['table_name'] = $this->tableName;
        }
        if ($this->dynamicPermissions !== null) {
            $payload['dynamic_permissions'] = $this->dynamicPermissions->toArray();
        }
        if ($this->description !== null) {
            $payload['description'] = $this->description;
        }
        return $payload;
    }
}
