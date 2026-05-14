<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseDynamicPermissions
{
    /**
     * @param array<string, MagicBaseColumnDynamicPermission> $columns
     */
    public function __construct(
        private MagicBaseTableDynamicPermission $table,
        private MagicBaseRowDynamicPermission $row,
        private array $columns,
    ) {
    }

    /**
     * @param null|array{
     *     table?: array{read_scope?: string, insert_scope?: string},
     *     row?: array{read_scope?: string, edit_scope?: string, delete_scope?: string},
     *     columns?: array<string, array{read_scope?: string, edit_scope?: string}>
     * } $payload
     */
    public static function fromArray(?array $payload): self
    {
        $payload ??= [];
        $columns = [];
        $columnPayloads = is_array($payload['columns'] ?? null) ? $payload['columns'] : [];
        foreach ($columnPayloads as $columnKey => $columnPermission) {
            if (! is_string($columnKey)) {
                continue;
            }
            $columns[$columnKey] = MagicBaseColumnDynamicPermission::fromArray(is_array($columnPermission) ? $columnPermission : null);
        }

        return new self(
            MagicBaseTableDynamicPermission::fromArray(is_array($payload['table'] ?? null) ? $payload['table'] : null),
            MagicBaseRowDynamicPermission::fromArray(is_array($payload['row'] ?? null) ? $payload['row'] : null),
            $columns,
        );
    }

    public function getTable(): MagicBaseTableDynamicPermission
    {
        return $this->table;
    }

    public function getRow(): MagicBaseRowDynamicPermission
    {
        return $this->row;
    }

    /**
     * @return array<string, MagicBaseColumnDynamicPermission>
     */
    public function getColumns(): array
    {
        return $this->columns;
    }

    public function getColumn(string $columnKey): ?MagicBaseColumnDynamicPermission
    {
        return $this->columns[$columnKey] ?? null;
    }

    /**
     * @return array{
     *     table: array{read_scope: string, insert_scope: string},
     *     row: array{read_scope: string, edit_scope: string, delete_scope: string},
     *     columns: array<string, array{read_scope: string, edit_scope: string}>
     * }
     */
    public function toArray(): array
    {
        return [
            'table' => $this->table->toArray(),
            'row' => $this->row->toArray(),
            'columns' => array_map(static fn (MagicBaseColumnDynamicPermission $permission): array => $permission->toArray(), $this->columns),
        ];
    }
}
