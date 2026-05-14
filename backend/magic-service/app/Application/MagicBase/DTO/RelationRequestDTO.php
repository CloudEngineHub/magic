<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class RelationRequestDTO
{
    public function __construct(
        private null|int|string $sourceTableId = null,
        private null|int|string $sourceColumnId = null,
        private null|int|string $targetTableId = null,
        private null|int|string $targetColumnId = null,
        private ?string $relationType = null,
        private ?string $relationName = null,
        private bool $hasSourceTableId = false,
        private bool $hasSourceColumnId = false,
        private bool $hasTargetTableId = false,
        private bool $hasTargetColumnId = false,
        private bool $hasRelationType = false,
        private bool $hasRelationName = false,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            $payload['source_table_id'] ?? null,
            $payload['source_column_id'] ?? null,
            $payload['target_table_id'] ?? null,
            $payload['target_column_id'] ?? null,
            array_key_exists('relation_type', $payload) ? (string) $payload['relation_type'] : null,
            array_key_exists('relation_name', $payload) ? (string) $payload['relation_name'] : null,
            array_key_exists('source_table_id', $payload),
            array_key_exists('source_column_id', $payload),
            array_key_exists('target_table_id', $payload),
            array_key_exists('target_column_id', $payload),
            array_key_exists('relation_type', $payload),
            array_key_exists('relation_name', $payload),
        );
    }

    public function getSourceTableId(): null|int|string
    {
        return $this->sourceTableId;
    }

    public function getSourceColumnId(): null|int|string
    {
        return $this->sourceColumnId;
    }

    public function getTargetTableId(): null|int|string
    {
        return $this->targetTableId;
    }

    public function getTargetColumnId(): null|int|string
    {
        return $this->targetColumnId;
    }

    public function getRelationType(): ?string
    {
        return $this->relationType;
    }

    public function getRelationName(): ?string
    {
        return $this->relationName;
    }

    public function hasSourceTableId(): bool
    {
        return $this->hasSourceTableId;
    }

    public function hasSourceColumnId(): bool
    {
        return $this->hasSourceColumnId;
    }

    public function hasTargetTableId(): bool
    {
        return $this->hasTargetTableId;
    }

    public function hasTargetColumnId(): bool
    {
        return $this->hasTargetColumnId;
    }

    public function hasRelationType(): bool
    {
        return $this->hasRelationType;
    }

    public function hasRelationName(): bool
    {
        return $this->hasRelationName;
    }

    /**
     * @return array{
     *     source_table_id?: null|int|string,
     *     source_column_id?: null|int|string,
     *     target_table_id?: null|int|string,
     *     target_column_id?: null|int|string,
     *     relation_type?: string,
     *     relation_name?: string
     * }
     */
    public function toArray(): array
    {
        $payload = [];
        if ($this->hasSourceTableId) {
            $payload['source_table_id'] = $this->sourceTableId;
        }
        if ($this->hasSourceColumnId) {
            $payload['source_column_id'] = $this->sourceColumnId;
        }
        if ($this->hasTargetTableId) {
            $payload['target_table_id'] = $this->targetTableId;
        }
        if ($this->hasTargetColumnId) {
            $payload['target_column_id'] = $this->targetColumnId;
        }
        if ($this->hasRelationType) {
            $payload['relation_type'] = $this->relationType;
        }
        if ($this->hasRelationName) {
            $payload['relation_name'] = $this->relationName;
        }
        return $payload;
    }
}
