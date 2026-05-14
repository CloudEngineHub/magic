<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO;

class CreateRelationRequest extends AbstractMagicBaseDTO
{
    protected ?int $sourceTableId = null;

    protected ?int $sourceColumnId = null;

    protected ?int $targetTableId = null;

    protected ?int $targetColumnId = null;

    protected string $relationType = '';

    protected string $relationName = '';

    public function getSourceTableId(): ?int
    {
        return $this->sourceTableId;
    }

    public function setSourceTableId(null|int|string $value): void
    {
        $this->sourceTableId = is_numeric($value) ? (int) $value : null;
    }

    public function getSourceColumnId(): ?int
    {
        return $this->sourceColumnId;
    }

    public function setSourceColumnId(null|int|string $value): void
    {
        $this->sourceColumnId = is_numeric($value) ? (int) $value : null;
    }

    public function getTargetTableId(): ?int
    {
        return $this->targetTableId;
    }

    public function setTargetTableId(null|int|string $value): void
    {
        $this->targetTableId = is_numeric($value) ? (int) $value : null;
    }

    public function getTargetColumnId(): ?int
    {
        return $this->targetColumnId;
    }

    public function setTargetColumnId(null|int|string $value): void
    {
        $this->targetColumnId = is_numeric($value) ? (int) $value : null;
    }

    public function getRelationType(): string
    {
        return $this->relationType;
    }

    public function setRelationType(null|int|string $value): void
    {
        $this->relationType = $value === null ? '' : (string) $value;
    }

    public function getRelationName(): string
    {
        return $this->relationName;
    }

    public function setRelationName(null|int|string $value): void
    {
        $this->relationName = $value === null ? '' : (string) $value;
    }
}
