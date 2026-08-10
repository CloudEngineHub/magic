<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseDynamicPermissions;

class UpdateTableRequest extends AbstractMagicBaseDTO
{
    protected ?string $tableKey = null;

    protected ?string $tableName = null;

    protected ?MagicBaseDynamicPermissions $dynamicPermissions = null;

    protected ?string $description = null;

    public function getTableKey(): ?string
    {
        return $this->tableKey;
    }

    public function setTableKey(null|int|string $value): void
    {
        $this->tableKey = $value === null ? null : (string) $value;
    }

    public function getTableName(): ?string
    {
        return $this->tableName;
    }

    public function setTableName(null|int|string $value): void
    {
        $this->tableName = $value === null ? null : (string) $value;
    }

    public function getDynamicPermissions(): ?MagicBaseDynamicPermissions
    {
        return $this->dynamicPermissions;
    }

    public function setDynamicPermissions(null|array|string $value): void
    {
        $payload = is_string($value) ? (json_decode($value, true) ?: null) : (is_array($value) ? $value : null);
        $this->dynamicPermissions = $payload === null ? null : MagicBaseDynamicPermissions::fromArray($payload);
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(null|int|string $value): void
    {
        $this->description = $value === null ? null : (string) $value;
    }
}
