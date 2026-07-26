<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\ValueObject\ColumnType;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDefinitionCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDynamicPermission;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;

class MagicBaseColumnDomainService
{
    public function validateCreateList(MagicBaseColumnDefinitionCollection $columns): void
    {
        $seen = [];
        foreach ($columns as $column) {
            $this->validatePayload($column->toArray());
            $key = trim($column->getColumnKey());
            if (isset($seen[$key])) {
                $this->invalid('字段标识重复');
            }
            $seen[$key] = true;
        }
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
    public function validatePayload(array $payload): void
    {
        $this->requireString($payload['column_key'] ?? null, '字段标识');
        $this->requireString($payload['column_name'] ?? null, '字段名称');
        $dataType = trim((string) ($payload['data_type'] ?? ''));
        if (! in_array($dataType, MagicBaseConst::DATA_TYPES, true)) {
            $this->invalid('字段类型');
        }

        $defaultValue = $payload['default_value'] ?? null;
        if ($defaultValue !== null) {
            $isValid = match (ColumnType::tryFrom($dataType)) {
                ColumnType::Text => is_string($defaultValue),
                ColumnType::Number => MagicBaseNumberNormalizer::normalize($defaultValue) !== null,
                ColumnType::Datetime => MagicBaseDateTimeNormalizer::normalize($defaultValue) !== null,
                ColumnType::Boolean => is_bool($defaultValue) || $defaultValue === 0 || $defaultValue === 1 || $defaultValue === '0' || $defaultValue === '1',
                ColumnType::Json => is_array($defaultValue) || is_object($defaultValue) || is_string($defaultValue),
                default => false,
            };
            if (! $isValid) {
                $this->invalid('默认值');
            }
        }

        $this->normalizeDynamicPermission(is_array($payload['dynamic_permission'] ?? null) ? $payload['dynamic_permission'] : null);
    }

    /**
     * @param null|array{read_scope?: string, edit_scope?: string}|MagicBaseColumnDynamicPermission $permission
     */
    public function normalizeDynamicPermission(null|array|MagicBaseColumnDynamicPermission $permission): MagicBaseColumnDynamicPermission
    {
        $normalized = array_merge(MagicBaseConst::DEFAULT_COLUMN_PERMISSIONS, $permission instanceof MagicBaseColumnDynamicPermission ? $permission->toArray() : ($permission ?? []));
        foreach (['column.read_scope' => $normalized['read_scope'], 'column.edit_scope' => $normalized['edit_scope']] as $label => $scope) {
            if (! in_array((string) $scope, MagicBaseConst::SCOPES, true)) {
                $this->invalid($label);
            }
        }
        return new MagicBaseColumnDynamicPermission((string) $normalized['read_scope'], (string) $normalized['edit_scope']);
    }

    private function requireString(mixed $value, string $label): void
    {
        if (! is_string($value) || trim($value) === '') {
            MagicBaseExceptionBuilder::parameterMissing($label);
        }
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::validateFailed($label);
    }
}
