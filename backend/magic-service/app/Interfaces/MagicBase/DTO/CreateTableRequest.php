<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDefinitionCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseDynamicPermissions;

class CreateTableRequest extends AbstractMagicBaseDTO
{
    protected string $tableKey = '';

    protected string $tableName = '';

    protected ?MagicBaseColumnDefinitionCollection $columns = null;

    protected ?MagicBaseDynamicPermissions $dynamicPermissions = null;

    protected string $description = '';

    protected string $projectName = '';

    public function getTableKey(): string
    {
        return $this->tableKey;
    }

    public function setTableKey(null|int|string $value): void
    {
        $this->tableKey = $value === null ? '' : (string) $value;
    }

    public function getTableName(): string
    {
        return $this->tableName;
    }

    public function setTableName(null|int|string $value): void
    {
        $this->tableName = $value === null ? '' : (string) $value;
    }

    public function getColumns(): MagicBaseColumnDefinitionCollection
    {
        return $this->columns ?? new MagicBaseColumnDefinitionCollection([]);
    }

    public function setColumns(null|array|string $value): void
    {
        $payload = is_string($value) ? (json_decode($value, true) ?: []) : (is_array($value) ? $value : []);
        $this->columns = MagicBaseColumnDefinitionCollection::fromArray($payload);
    }

    public function getDynamicPermissions(): MagicBaseDynamicPermissions
    {
        return $this->dynamicPermissions ?? MagicBaseDynamicPermissions::fromArray(null);
    }

    public function setDynamicPermissions(null|array|string $value): void
    {
        $payload = is_string($value) ? (json_decode($value, true) ?: null) : (is_array($value) ? $value : null);
        $this->dynamicPermissions = MagicBaseDynamicPermissions::fromArray($payload);
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function setDescription(null|int|string $value): void
    {
        $this->description = $value === null ? '' : (string) $value;
    }

    public function getProjectName(): string
    {
        return $this->projectName;
    }

    public function setProjectName(null|int|string $value): void
    {
        $this->projectName = $value === null ? '' : (string) $value;
    }
}
