<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class BatchCreateRowsRequestDTO
{
    /**
     * @param list<array<string, mixed>> $rows
     */
    public function __construct(
        private array $rows = [],
        private string $select = '',
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(
            self::normalizeRows($payload['rows'] ?? []),
            self::normalizeSelect($payload['select'] ?? ''),
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function getRows(): array
    {
        return $this->rows;
    }

    public function getSelect(): string
    {
        return $this->select;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function normalizeRows(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $rows = [];
        foreach ($value as $row) {
            if (is_array($row)) {
                $rows[] = $row;
            }
        }
        return $rows;
    }

    private static function normalizeSelect(mixed $value): string
    {
        if ($value === null) {
            return '';
        }
        if (! is_array($value)) {
            return is_scalar($value) ? trim((string) $value) : '';
        }

        $fields = [];
        foreach ($value as $field) {
            if (! is_scalar($field)) {
                continue;
            }
            $field = trim((string) $field);
            if ($field !== '') {
                $fields[] = $field;
            }
        }
        return implode(',', $fields);
    }
}
