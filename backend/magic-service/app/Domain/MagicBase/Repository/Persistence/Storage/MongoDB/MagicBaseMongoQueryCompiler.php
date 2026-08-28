<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterCondition;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterGroup;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterNode;
use MongoDB\BSON\Regex;

readonly class MagicBaseMongoQueryCompiler
{
    private const LEGACY_NUMBER_PATTERN = '^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$';

    private const DATETIME_SECOND_PATTERNS = [
        '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$',
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$',
    ];

    private const DATETIME_MINUTE_PATTERNS = [
        '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$',
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$',
    ];

    /**
     * @return array<string, mixed>
     */
    public function compileFilter(MagicBaseFilterGroup $filter): array
    {
        return $this->compileGroup($filter);
    }

    public function fieldPath(string $field): string
    {
        return match ($field) {
            'id', 'record_id' => 'record_id',
            'data_organization_code' => 'data_organization_code',
            'organization_code' => 'organization_code',
            'created_at' => 'created_at',
            'updated_at' => 'updated_at',
            'created_by' => 'created_by',
            default => 'data.' . $field,
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function compileGroup(MagicBaseFilterGroup $group): array
    {
        $items = array_values(array_filter(array_map(
            fn (MagicBaseFilterNode $item): array => $this->compileNode($item),
            $group->getItems(),
        ), static fn (array $item): bool => $item !== []));

        if ($items === []) {
            return $group->getLogic() === 'or'
                ? ['record_id' => ['$in' => []]]
                : [];
        }
        if (count($items) === 1) {
            return $items[0];
        }
        return ['$' . $group->getLogic() => $items];
    }

    /**
     * @return array<string, mixed>
     */
    private function compileNode(MagicBaseFilterNode $node): array
    {
        if ($node instanceof MagicBaseFilterGroup) {
            return $this->compileGroup($node);
        }
        if ($node instanceof MagicBaseFilterCondition) {
            return $this->compileCondition($node);
        }
        return [];
    }

    /**
     * @return array<string, mixed>
     */
    private function compileCondition(MagicBaseFilterCondition $condition): array
    {
        $field = $condition->getField();
        $path = $this->fieldPath($field);
        $operator = $condition->getOperator();
        $value = $this->normalizeStorageValue($field, $condition->getValue());

        $compiled = match ($operator) {
            'eq' => [$path => $value],
            'in' => [$path => ['$in' => array_map(
                fn (mixed $item): mixed => $this->normalizeStorageValue($field, $item),
                $condition->getValue(),
            )]],
            'contains' => [$path => new Regex(preg_quote($value, '/'), 'i')],
            'gt', 'gte', 'lt', 'lte' => [$path => ['$' . $operator => $value]],
            default => [],
        };

        return match ($condition->getDataType()) {
            'number' => $this->compileNumberCompatibility($path, $operator, $value, $compiled),
            'boolean' => $this->compileBooleanCompatibility($path, $operator, $value, $compiled),
            'datetime' => str_starts_with($path, 'data.')
                ? $this->compileDatetimeCompatibility($path, $operator, $value, $compiled)
                : $compiled,
            default => $compiled,
        };
    }

    /**
     * Dynamic datetime values were historically stored by datetime-local controls with either a
     * space or T separator and with optional seconds. Equality stays index-friendly through an
     * explicit value list. Range queries partition the known string formats before comparing so
     * values with different separators are never compared lexicographically against each other.
     *
     * @param array<string, mixed> $compiled
     * @return array<string, mixed>
     */
    private function compileDatetimeCompatibility(string $path, string $operator, mixed $value, array $compiled): array
    {
        if (! is_string($value) || ! in_array($operator, ['eq', 'gt', 'gte', 'lt', 'lte'], true)) {
            return $compiled;
        }

        $secondValues = [$value, str_replace(' ', 'T', $value)];
        if ($operator === 'eq') {
            $values = $secondValues;
            if (str_ends_with($value, ':00')) {
                $minuteValue = substr($value, 0, 16);
                $values[] = $minuteValue;
                $values[] = str_replace(' ', 'T', $minuteValue);
            }
            return [$path => ['$in' => $values]];
        }

        $minuteValue = substr($value, 0, 16);
        $minuteOperator = $this->minutePrecisionOperator($operator, (int) substr($value, -2));
        $minuteValues = [$minuteValue, str_replace(' ', 'T', $minuteValue)];
        $branches = [];
        foreach (self::DATETIME_SECOND_PATTERNS as $index => $pattern) {
            $branches[] = $this->compileDatetimeFormatBranch(
                $path,
                $pattern,
                $operator,
                $secondValues[$index],
            );
        }
        foreach (self::DATETIME_MINUTE_PATTERNS as $index => $pattern) {
            $branches[] = $this->compileDatetimeFormatBranch(
                $path,
                $pattern,
                $minuteOperator,
                $minuteValues[$index],
            );
        }
        return ['$or' => $branches];
    }

    private function minutePrecisionOperator(string $operator, int $seconds): string
    {
        if ($seconds === 0) {
            return $operator;
        }
        return match ($operator) {
            'gte' => 'gt',
            'lt' => 'lte',
            default => $operator,
        };
    }

    /**
     * @return array{'$and': array{array<string, Regex>, array<string, array<string, string>>}}
     */
    private function compileDatetimeFormatBranch(
        string $path,
        string $pattern,
        string $operator,
        string $value,
    ): array {
        return ['$and' => [
            [$path => new Regex($pattern)],
            [$path => ['$' . $operator => $value]],
        ]];
    }

    /**
     * Historical rows may contain numeric strings because the write API previously accepted them
     * without converting the BSON value. Keep the canonical branch index-friendly and use a
     * guarded conversion branch only for string values.
     *
     * @param array<string, mixed> $compiled
     * @return array<string, mixed>
     */
    private function compileNumberCompatibility(string $path, string $operator, mixed $value, array $compiled): array
    {
        $values = $operator === 'in' && is_array($value) ? $value : [$value];
        $legacyValues = array_values(array_filter($values, static fn (mixed $item): bool => $item !== null));
        if ($legacyValues === [] || ! in_array($operator, ['eq', 'in', 'gt', 'gte', 'lt', 'lte'], true)) {
            return $compiled;
        }

        $convertedField = $this->decimalConversion('$' . $path);
        $comparison = $operator === 'in'
            ? ['$in' => [$convertedField, array_map($this->decimalConversion(...), $legacyValues)]]
            : ['$' . $operator => [$convertedField, $this->decimalConversion($legacyValues[0])]];

        return ['$or' => [
            $compiled,
            ['$and' => [
                [$path => ['$type' => 'string']],
                [$path => new Regex(self::LEGACY_NUMBER_PATTERN)],
                ['$expr' => $comparison],
            ]],
        ]];
    }

    /**
     * @param array<string, mixed> $compiled
     * @return array<string, mixed>
     */
    private function compileBooleanCompatibility(string $path, string $operator, mixed $value, array $compiled): array
    {
        if ($operator === 'eq' && is_bool($value)) {
            return [$path => ['$in' => $this->legacyBooleanValues($value)]];
        }
        if ($operator !== 'in' || ! is_array($value)) {
            return $compiled;
        }

        $values = [];
        foreach ($value as $item) {
            foreach (is_bool($item) ? $this->legacyBooleanValues($item) : [$item] as $candidate) {
                if (! in_array($candidate, $values, true)) {
                    $values[] = $candidate;
                }
            }
        }
        return [$path => ['$in' => $values]];
    }

    /**
     * @return list<bool|int|string>
     */
    private function legacyBooleanValues(bool $value): array
    {
        return $value ? [true, 1, '1'] : [false, 0, '0'];
    }

    /**
     * @return array{'$convert': array{input: mixed, to: string, onError: null, onNull: null}}
     */
    private function decimalConversion(mixed $value): array
    {
        return ['$convert' => [
            'input' => $value,
            'to' => 'decimal',
            'onError' => null,
            'onNull' => null,
        ]];
    }

    private function normalizeStorageValue(string $field, mixed $value): mixed
    {
        if (in_array($field, ['id', 'record_id'], true)) {
            if ($value === null) {
                return null;
            }
            return (int) $value;
        }
        return $value;
    }
}
