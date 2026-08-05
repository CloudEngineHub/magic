<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDynamicPermission;

class CreateColumnRequest extends AbstractMagicBaseDTO
{
    protected string $columnKey = '';

    protected string $columnName = '';

    protected string $dataType = '';

    protected bool $isRequired = false;

    protected mixed $defaultValue = null;

    protected ?MagicBaseColumnDynamicPermission $dynamicPermission = null;

    public function getColumnKey(): string
    {
        return $this->columnKey;
    }

    public function setColumnKey(null|int|string $value): void
    {
        $this->columnKey = $value === null ? '' : (string) $value;
    }

    public function getColumnName(): string
    {
        return $this->columnName;
    }

    public function setColumnName(null|int|string $value): void
    {
        $this->columnName = $value === null ? '' : (string) $value;
    }

    public function getDataType(): string
    {
        return $this->dataType;
    }

    public function setDataType(null|int|string $value): void
    {
        $this->dataType = $value === null ? '' : (string) $value;
    }

    public function getIsRequired(): bool
    {
        return $this->isRequired;
    }

    public function setIsRequired(null|bool|int|string $value): void
    {
        $this->isRequired = (bool) $value;
    }

    public function getDefaultValue(): mixed
    {
        return $this->defaultValue;
    }

    public function setDefaultValue(mixed $value): void
    {
        $this->defaultValue = $value;
    }

    public function getDynamicPermission(): ?MagicBaseColumnDynamicPermission
    {
        return $this->dynamicPermission;
    }

    public function setDynamicPermission(null|array|string $value): void
    {
        $payload = is_string($value) ? (json_decode($value, true) ?: null) : (is_array($value) ? $value : null);
        $this->dynamicPermission = $payload === null ? null : MagicBaseColumnDynamicPermission::fromArray($payload);
    }
}
