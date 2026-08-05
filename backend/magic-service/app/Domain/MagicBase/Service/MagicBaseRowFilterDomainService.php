<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterCondition;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFilterGroup;
use App\Domain\MagicBase\Exception\MagicBaseInvalidFilterException;

readonly class MagicBaseRowFilterDomainService
{
    private const MAX_CONDITIONS = 10;

    private const MAX_GROUP_DEPTH = 2;

    private const MAX_OR_ITEMS = 5;

    private const MAX_IN_VALUES = 100;

    private const MIN_CONTAINS_LENGTH = 2;

    private const MAX_CONTAINS_LENGTH = 100;

    private const SYSTEM_FIELD_TYPES = [
        'id' => 'id',
        'record_id' => 'id',
        'organization_code' => 'text',
        'created_by' => 'text',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    private const OPERATORS_BY_TYPE = [
        'id' => ['eq', 'in', 'gt', 'gte', 'lt', 'lte'],
        'text' => ['eq', 'in', 'contains'],
        'number' => ['eq', 'in', 'gt', 'gte', 'lt', 'lte'],
        'datetime' => ['eq', 'gt', 'gte', 'lt', 'lte'],
        'boolean' => ['eq', 'in'],
        'json' => [],
    ];

    /**
     * Parse the public query DSL into a small, typed tree used by storage adapters.
     * The legacy field-keyed filter is normalized through the same validation path.
     *
     * @param array<string, mixed> $filter
     * @param array<string, string> $fieldTypes available dynamic columns keyed by column_key
     * @param list<string> $unboundedInFields relation fields resolved by the trusted application layer
     */
    public function parse(array $filter, array $fieldTypes, array $unboundedInFields = []): MagicBaseFilterGroup
    {
        if ($filter === []) {
            return new MagicBaseFilterGroup('and', []);
        }

        $availableFieldTypes = self::SYSTEM_FIELD_TYPES + $fieldTypes;
        $unboundedInFieldSet = array_fill_keys($unboundedInFields, true);
        $conditionCount = 0;
        if ($this->isGroupPayload($filter)) {
            return $this->parseGroup($filter, $availableFieldTypes, $unboundedInFieldSet, 1, $conditionCount);
        }

        $items = [];
        foreach ($filter as $field => $conditions) {
            if (! is_string($field) || ! is_array($conditions)) {
                $this->invalid('筛选字段或条件格式不正确', ['field' => $field]);
            }
            foreach ($conditions as $operator => $value) {
                if (! is_string($operator)) {
                    $this->invalid('筛选操作符格式不正确', ['field' => $field]);
                }
                $items[] = $this->parseCondition([
                    'field' => $field,
                    'operator' => $operator,
                    'value' => $value,
                ], $availableFieldTypes, $unboundedInFieldSet, $conditionCount);
            }
        }

        return new MagicBaseFilterGroup('and', $items);
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, string> $fieldTypes
     * @param array<string, true> $unboundedInFields
     */
    private function parseGroup(array $payload, array $fieldTypes, array $unboundedInFields, int $depth, int &$conditionCount): MagicBaseFilterGroup
    {
        if ($depth > self::MAX_GROUP_DEPTH) {
            $this->invalid('筛选条件组最多支持两层嵌套', ['reason' => 'group_depth_exceeded']);
        }

        $logic = strtolower(trim((string) ($payload['logic'] ?? '')));
        if (! in_array($logic, ['and', 'or'], true)) {
            $this->invalid('筛选条件组只支持 and 或 or', ['logic' => $logic]);
        }

        $rawItems = $payload['items'] ?? null;
        if (! is_array($rawItems) || ! array_is_list($rawItems)) {
            $this->invalid('筛选条件组 items 必须是数组', ['reason' => 'invalid_group_items']);
        }
        if ($logic === 'or' && $rawItems === []) {
            $this->invalid('任意满足条件组至少需要一个条件', ['reason' => 'empty_or_group']);
        }
        if ($logic === 'and' && $depth > 1 && $rawItems === []) {
            $this->invalid('嵌套筛选条件组至少需要一个条件', ['reason' => 'empty_nested_and_group']);
        }
        if ($logic === 'or' && count($rawItems) > self::MAX_OR_ITEMS) {
            $this->invalid('任意满足条件组最多支持 5 项', ['reason' => 'or_items_exceeded']);
        }

        $items = [];
        foreach ($rawItems as $item) {
            if (! is_array($item)) {
                $this->invalid('筛选条件格式不正确', ['reason' => 'invalid_filter_item']);
            }
            $items[] = $this->isGroupPayload($item)
                ? $this->parseGroup($item, $fieldTypes, $unboundedInFields, $depth + 1, $conditionCount)
                : $this->parseCondition($item, $fieldTypes, $unboundedInFields, $conditionCount);
        }

        return new MagicBaseFilterGroup($logic, $items);
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, string> $fieldTypes
     * @param array<string, true> $unboundedInFields
     */
    private function parseCondition(array $payload, array $fieldTypes, array $unboundedInFields, int &$conditionCount): MagicBaseFilterCondition
    {
        ++$conditionCount;
        if ($conditionCount > self::MAX_CONDITIONS) {
            $this->invalid('筛选条件最多支持 10 个', ['reason' => 'condition_count_exceeded']);
        }

        $field = trim((string) ($payload['field'] ?? ''));
        $operator = strtolower(trim((string) ($payload['operator'] ?? '')));
        if ($field === '' || str_contains($field, '.')) {
            $this->invalid('组合筛选暂不支持关联字段', ['field' => $field]);
        }

        $dataType = $fieldTypes[$field] ?? null;
        if ($dataType === null) {
            $this->invalid('筛选字段不存在或当前用户无读取权限', ['field' => $field]);
        }

        $allowedOperators = self::OPERATORS_BY_TYPE[$dataType] ?? [];
        if (! in_array($operator, $allowedOperators, true)) {
            $this->invalid('字段类型不支持该筛选操作符', [
                'field' => $field,
                'data_type' => $dataType,
                'operator' => $operator,
            ]);
        }

        $value = $payload['value'] ?? null;
        if ($operator === 'in') {
            if (! is_array($value) || ! array_is_list($value)) {
                $this->invalid('in 操作符需要数组', ['field' => $field]);
            }
            if (count($value) > self::MAX_IN_VALUES && ! isset($unboundedInFields[$field])) {
                $this->invalid('in 操作符最多支持 100 个值', ['field' => $field]);
            }
            $value = array_map(
                fn (mixed $item): mixed => $item === null
                    ? null
                    : $this->normalizeValue($dataType, $item, $field),
                $value,
            );
        } elseif ($operator === 'eq' && $value === null) {
            $value = null;
        } else {
            $value = $this->normalizeValue($dataType, $value, $field);
        }

        if ($operator === 'contains') {
            $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
            if ($length < self::MIN_CONTAINS_LENGTH || $length > self::MAX_CONTAINS_LENGTH) {
                $this->invalid('包含搜索内容长度必须在 2 到 100 个字符之间', ['field' => $field]);
            }
        }

        return new MagicBaseFilterCondition($field, $operator, $value, $dataType);
    }

    private function normalizeValue(string $dataType, mixed $value, string $field): mixed
    {
        return match ($dataType) {
            'id' => $this->normalizeId($value, $field),
            'text' => $this->normalizeText($value, $field),
            'number' => $this->normalizeNumber($value, $field),
            'datetime' => $this->normalizeDatetime($value, $field),
            'boolean' => $this->normalizeBoolean($value, $field),
            default => throw new MagicBaseInvalidFilterException('字段类型暂不支持筛选', [
                'field' => $field,
                'data_type' => $dataType,
            ]),
        };
    }

    private function normalizeId(mixed $value, string $field): int
    {
        if (is_int($value)) {
            if ($value > 0) {
                return $value;
            }
            $this->invalid('记录 ID 必须是正整数', ['field' => $field]);
        }
        if (! is_string($value) || ! ctype_digit($value)) {
            $this->invalid('记录 ID 必须是正整数', ['field' => $field]);
        }
        $canonical = ltrim($value, '0');
        $maxInteger = (string) PHP_INT_MAX;
        if (
            $canonical === ''
            || strlen($canonical) > strlen($maxInteger)
            || (strlen($canonical) === strlen($maxInteger) && strcmp($canonical, $maxInteger) > 0)
        ) {
            $this->invalid('记录 ID 必须是正整数', ['field' => $field]);
        }
        return (int) $canonical;
    }

    private function normalizeText(mixed $value, string $field): string
    {
        if (! is_string($value)) {
            $this->invalid('文本筛选值必须是字符串', ['field' => $field]);
        }
        return trim($value);
    }

    private function normalizeNumber(mixed $value, string $field): float|int
    {
        $number = MagicBaseNumberNormalizer::normalize($value);
        if ($number === null) {
            $this->invalid('数字筛选值格式不正确', ['field' => $field]);
        }
        return $number;
    }

    private function normalizeDatetime(mixed $value, string $field): string
    {
        $normalized = MagicBaseDateTimeNormalizer::normalize($value);
        if ($normalized === null) {
            $this->invalid('日期筛选值格式不正确', ['field' => $field]);
        }
        return $normalized;
    }

    private function normalizeBoolean(mixed $value, string $field): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (in_array($value, [0, '0', 'false'], true)) {
            return false;
        }
        if (in_array($value, [1, '1', 'true'], true)) {
            return true;
        }
        $this->invalid('布尔筛选值格式不正确', ['field' => $field]);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function isGroupPayload(array $payload): bool
    {
        return is_string($payload['logic'] ?? null);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function invalid(string $message, array $data = []): never
    {
        throw new MagicBaseInvalidFilterException($message, $data);
    }
}
