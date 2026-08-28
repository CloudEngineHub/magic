<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseColumnDefinition
{
    public function __construct(
        private string $columnKey,
        private string $columnName,
        private string $dataType,
        private bool $required = false,
        private mixed $defaultValue = null,
        private ?MagicBaseColumnDynamicPermission $dynamicPermission = null,
    ) {
    }

    /**
     * @param array{
     *     column_key?: string,
     *     column_name?: string,
     *     data_type?: string,
     *     is_required?: bool,
     *     default_value?: mixed,
     *     dynamic_permission?: null|array{read_scope?: string, edit_scope?: string}
     * } $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            (string) ($payload['column_key'] ?? ''),
            (string) ($payload['column_name'] ?? ''),
            (string) ($payload['data_type'] ?? ''),
            (bool) ($payload['is_required'] ?? false),
            $payload['default_value'] ?? null,
            is_array($payload['dynamic_permission'] ?? null) ? MagicBaseColumnDynamicPermission::fromArray($payload['dynamic_permission']) : null,
        );
    }

    public function getColumnKey(): string
    {
        return $this->columnKey;
    }

    public function getColumnName(): string
    {
        return $this->columnName;
    }

    public function getDataType(): string
    {
        return $this->dataType;
    }

    public function isRequired(): bool
    {
        return $this->required;
    }

    public function getDefaultValue(): mixed
    {
        return $this->defaultValue;
    }

    public function getDynamicPermission(): ?MagicBaseColumnDynamicPermission
    {
        return $this->dynamicPermission;
    }

    /**
     * @return array{
     *     column_key: string,
     *     column_name: string,
     *     data_type: string,
     *     is_required: bool,
     *     default_value: mixed,
     *     dynamic_permission?: array{read_scope: string, edit_scope: string}
     * }
     */
    public function toArray(): array
    {
        $payload = [
            'column_key' => $this->columnKey,
            'column_name' => $this->columnName,
            'data_type' => $this->dataType,
            'is_required' => $this->required,
            'default_value' => $this->defaultValue,
        ];
        if ($this->dynamicPermission !== null) {
            $payload['dynamic_permission'] = $this->dynamicPermission->toArray();
        }
        return $payload;
    }
}
