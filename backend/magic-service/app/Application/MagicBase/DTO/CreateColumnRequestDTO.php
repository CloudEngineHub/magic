<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDynamicPermission;

readonly class CreateColumnRequestDTO
{
    /**
     * @param null|array<string, mixed>|list<mixed> $options
     */
    public function __construct(
        private ?string $columnKey = null,
        private ?string $columnName = null,
        private ?string $dataType = null,
        private bool $isRequired = false,
        private mixed $defaultValue = null,
        private ?array $options = null,
        private ?MagicBaseColumnDynamicPermission $dynamicPermission = null,
    ) {
    }

    public static function fromRequest(
        string $columnKey,
        string $columnName,
        string $dataType,
        bool $isRequired,
        mixed $defaultValue,
        ?array $options,
        ?MagicBaseColumnDynamicPermission $dynamicPermission,
    ): self {
        return new self($columnKey, $columnName, $dataType, $isRequired, $defaultValue, $options, $dynamicPermission);
    }

    public function getColumnKey(): ?string
    {
        return $this->columnKey;
    }

    public function getColumnName(): ?string
    {
        return $this->columnName;
    }

    public function getDataType(): ?string
    {
        return $this->dataType;
    }

    public function isRequired(): bool
    {
        return $this->isRequired;
    }

    public function getDefaultValue(): mixed
    {
        return $this->defaultValue;
    }

    /**
     * @return null|array<string, mixed>|list<mixed>
     */
    public function getOptions(): ?array
    {
        return $this->options;
    }

    public function getDynamicPermission(): ?MagicBaseColumnDynamicPermission
    {
        return $this->dynamicPermission;
    }

    /**
     * @return array{
     *     column_key?: string,
     *     column_name?: string,
     *     data_type?: string,
     *     is_required?: bool,
     *     default_value?: mixed,
     *     options?: null|array<string, mixed>|list<mixed>,
     *     dynamic_permission?: array{read_scope: string, edit_scope: string}
     * }
     */
    public function toArray(): array
    {
        $payload = [
            'is_required' => $this->isRequired,
            'default_value' => $this->defaultValue,
        ];
        if ($this->columnKey !== null) {
            $payload['column_key'] = $this->columnKey;
        }
        if ($this->columnName !== null) {
            $payload['column_name'] = $this->columnName;
        }
        if ($this->dataType !== null) {
            $payload['data_type'] = $this->dataType;
        }
        if ($this->options !== null) {
            $payload['options'] = $this->options;
        }
        if ($this->dynamicPermission !== null) {
            $payload['dynamic_permission'] = $this->dynamicPermission->toArray();
        }
        return $payload;
    }
}
