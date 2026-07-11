<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class BatchPermissionRequestDTO
{
    /**
     * @param list<string> $tablePermissions
     * @param list<array{column_ids: list<string>, can_read: bool, can_edit: bool}> $columnPermissions
     * @param list<array{record_ids: list<string>, can_read: bool, can_edit: bool, can_delete: bool}> $rowPermissions
     */
    public function __construct(
        private ?string $subjectType = null,
        private null|int|string $subjectId = null,
        private array $tablePermissions = [],
        private array $columnPermissions = [],
        private array $rowPermissions = [],
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            array_key_exists('subject_type', $payload) ? (string) $payload['subject_type'] : null,
            $payload['subject_id'] ?? null,
            self::normalizeStringList($payload['table_permissions'] ?? []),
            self::normalizeColumnPermissions($payload['column_permissions'] ?? []),
            self::normalizeRowPermissions($payload['row_permissions'] ?? []),
        );
    }

    public function getSubjectType(): ?string
    {
        return $this->subjectType;
    }

    public function getSubjectId(): null|int|string
    {
        return $this->subjectId;
    }

    /** @return array{subject_type?: string, subject_id?: null|int|string} */
    public function subjectPayload(): array
    {
        $payload = [];
        if ($this->subjectType !== null) {
            $payload['subject_type'] = $this->subjectType;
        }
        if ($this->subjectId !== null) {
            $payload['subject_id'] = $this->subjectId;
        }
        return $payload;
    }

    /** @return list<string> */
    public function getTablePermissions(): array
    {
        return $this->tablePermissions;
    }

    /** @return list<array{column_ids: list<string>, can_read: bool, can_edit: bool}> */
    public function getColumnPermissions(): array
    {
        return $this->columnPermissions;
    }

    /** @return list<array{record_ids: list<string>, can_read: bool, can_edit: bool, can_delete: bool}> */
    public function getRowPermissions(): array
    {
        return $this->rowPermissions;
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
}
