<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class BatchPermissionRequestDTO
{
    /**
     * @param list<string> $targetIds
     * @param list<array{
     *     subject_type: ?string,
     *     subject_id: null|int|string,
     *     target_type: string,
     *     table_permissions: list<string>,
     *     column_permissions: list<array{column_ids: list<string>, can_read: bool, can_edit: bool}>,
     *     row_permissions: list<array{record_ids: list<string>, can_read: bool, can_edit: bool, can_delete: bool}>
     * }> $permissions
     */
    public function __construct(
        private string $targetType = '',
        private array $targetIds = [],
        private array $permissions = [],
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            is_scalar($payload['target_type'] ?? null) ? trim((string) $payload['target_type']) : '',
            self::normalizeStringList($payload['target_ids'] ?? []),
            self::normalizePermissions($payload['permissions'] ?? []),
        );
    }

    public function getTargetType(): string
    {
        return $this->targetType;
    }

    /** @return list<string> */
    public function getTargetIds(): array
    {
        return $this->targetIds;
    }

    /**
     * @return list<array{
     *     subject_type: ?string,
     *     subject_id: null|int|string,
     *     target_type: string,
     *     table_permissions: list<string>,
     *     column_permissions: list<array{column_ids: list<string>, can_read: bool, can_edit: bool}>,
     *     row_permissions: list<array{record_ids: list<string>, can_read: bool, can_edit: bool, can_delete: bool}>
     * }>
     */
    public function getPermissions(): array
    {
        return $this->permissions;
    }

    /**
     * @return list<string>
     */
    private static function normalizeStringList(mixed $value): array
    {
        $values = is_array($value) ? $value : [];
        $result = [];
        foreach ($values as $item) {
            if (! is_scalar($item)) {
                continue;
            }
            $item = trim((string) $item);
            if ($item !== '' && ! in_array($item, $result, true)) {
                $result[] = $item;
            }
        }
        return $result;
    }

    /**
     * @return list<array{column_ids: list<string>, can_read: bool, can_edit: bool}>
     */
    private static function normalizeColumnPermissions(mixed $value): array
    {
        $items = is_array($value) ? $value : [];
        $result = [];
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $result[] = [
                'column_ids' => self::normalizeStringList($item['column_ids'] ?? []),
                'can_read' => (bool) ($item['can_read'] ?? false),
                'can_edit' => (bool) ($item['can_edit'] ?? false),
            ];
        }
        return $result;
    }

    /**
     * @return list<array{record_ids: list<string>, can_read: bool, can_edit: bool, can_delete: bool}>
     */
    private static function normalizeRowPermissions(mixed $value): array
    {
        $items = is_array($value) ? $value : [];
        $result = [];
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }
            $result[] = [
                'record_ids' => self::normalizeStringList($item['record_ids'] ?? []),
                'can_read' => (bool) ($item['can_read'] ?? false),
                'can_edit' => (bool) ($item['can_edit'] ?? false),
                'can_delete' => (bool) ($item['can_delete'] ?? false),
            ];
        }
        return $result;
    }

    /**
     * @return list<array{
     *     subject_type: ?string,
     *     subject_id: null|int|string,
     *     target_type: string,
     *     table_permissions: list<string>,
     *     column_permissions: list<array{column_ids: list<string>, can_read: bool, can_edit: bool}>,
     *     row_permissions: list<array{record_ids: list<string>, can_read: bool, can_edit: bool, can_delete: bool}>
     * }>
     */
    private static function normalizePermissions(mixed $value): array
    {
        $items = is_array($value) ? $value : [];
        $result = [];
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $subjectType = $item['subject_type'] ?? null;
            $result[] = [
                'subject_type' => is_scalar($subjectType) ? trim((string) $subjectType) : null,
                'subject_id' => is_scalar($item['subject_id'] ?? null) ? $item['subject_id'] : null,
                'target_type' => is_scalar($item['target_type'] ?? null) ? trim((string) $item['target_type']) : '',
                'table_permissions' => self::normalizeStringList($item['table_permissions'] ?? []),
                'column_permissions' => self::normalizeColumnPermissions($item['column_permissions'] ?? []),
                'row_permissions' => self::normalizeRowPermissions($item['row_permissions'] ?? []),
            ];
        }
        return $result;
    }
}
