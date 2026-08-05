<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseDynamicPermissions;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;

class MagicBaseTableDomainService
{
    /**
     * @param array{
     *     table_key?: string,
     *     table_name?: string,
     *     columns?: list<array<string, mixed>>,
     *     dynamic_permissions?: array<string, mixed>,
     *     description?: string,
     *     project_name?: string
     * } $payload
     */
    public function validateCreatePayload(array $payload): void
    {
        $this->requireString($payload['table_key'] ?? null, '表标识');
        $this->requireString($payload['table_name'] ?? null, '表名称');
        if (! is_array($payload['columns'] ?? null) || $payload['columns'] === []) {
            $this->empty('字段列表');
        }
    }

    public function normalizeDynamicPermissions(MagicBaseDynamicPermissions $permissions): MagicBaseDynamicPermissions
    {
        foreach ([
            'table.read_scope' => $permissions->getTable()->getReadScope(),
            'table.insert_scope' => $permissions->getTable()->getInsertScope(),
            'row.read_scope' => $permissions->getRow()->getReadScope(),
            'row.edit_scope' => $permissions->getRow()->getEditScope(),
            'row.delete_scope' => $permissions->getRow()->getDeleteScope(),
        ] as $label => $scope) {
            if (! in_array($scope, MagicBaseConst::SCOPES, true)) {
                $this->invalid($label);
            }
        }

        foreach ($permissions->getColumns() as $columnKey => $columnPermission) {
            if (trim($columnKey) === '') {
                $this->invalid('动态权限字段标识');
            }
            foreach ([
                'columns.' . $columnKey . '.read_scope' => $columnPermission->getReadScope(),
                'columns.' . $columnKey . '.edit_scope' => $columnPermission->getEditScope(),
            ] as $label => $scope) {
                if (! in_array($scope, MagicBaseConst::SCOPES, true)) {
                    $this->invalid($label);
                }
            }
        }

        return $permissions;
    }

    private function requireString(mixed $value, string $label): void
    {
        if (! is_string($value) || trim($value) === '') {
            $this->empty($label);
        }
    }

    private function empty(string $label): void
    {
        MagicBaseExceptionBuilder::parameterMissing($label);
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::validateFailed($label);
    }
}
