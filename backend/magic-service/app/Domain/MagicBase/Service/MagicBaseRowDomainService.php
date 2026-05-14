<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\ColumnType;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnIndex;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use DateTime;

class MagicBaseRowDomainService
{
    /**
     * @param null|array<string, mixed> $data dynamic row values keyed by MagicBase column_key
     * @return array<string, mixed> normalized dynamic row values keyed by MagicBase column_key
     */
    public function normalizeRowPayload(?array $data, MagicBaseColumnIndex $columnsByKey, bool $isCreate): array
    {
        if ($data === null) {
            $this->empty('data');
        }

        $normalized = [];
        foreach ($data as $field => $value) {
            if (! is_string($field) || ! $columnsByKey->has($field)) {
                $this->invalid('字段');
            }
            $this->validateFieldValue($columnsByKey->get($field), $value);
            $normalized[$field] = $value;
        }

        foreach ($columnsByKey->all() as $field => $column) {
            if (array_key_exists($field, $normalized)) {
                continue;
            }

            if ($isCreate) {
                if ($column->getDefaultValue() !== null) {
                    $normalized[$field] = $column->getDefaultValue();
                    continue;
                }
                if ($column->getIsRequired()) {
                    $this->empty($field);
                }
            }
        }

        return $normalized;
    }

    /**
     * @param array<string, mixed> $data dynamic row values keyed by MagicBase column_key
     */
    public function buildCreatePayload(string $organizationCode, int $projectId, int $tableId, string $userId, ActorContext $actor, array $data): MagicBaseRowEntity
    {
        $now = new DateTime();
        return new MagicBaseRowEntity([
            'record_id' => IdGenerator::getSnowId(),
            'organization_code' => $organizationCode,
            'project_id' => $projectId,
            'table_id' => $tableId,
            'created_by' => $userId,
            'owner_department_ids' => $actor->getDepartmentIds(),
            'data' => $data,
            'deleted' => false,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /**
     * @param array<string, mixed> $normalized normalized dynamic row values keyed by MagicBase column_key
     */
    public function applyUpdate(MagicBaseRowEntity $row, array $normalized): MagicBaseRowEntity
    {
        $row->setData(array_merge($row->getData(), $normalized));
        $row->setUpdatedAt(new DateTime());
        return $row;
    }

    public function markDeleted(MagicBaseRowEntity $row): MagicBaseRowEntity
    {
        $row->setDeleted(true);
        $row->setUpdatedAt(new DateTime());
        return $row;
    }

    private function validateFieldValue(MagicBaseColumnEntity $column, mixed $value): void
    {
        if ($value === null) {
            if ($column->getIsRequired()) {
                $this->empty($column->getColumnKey());
            }
            return;
        }

        $dataType = ColumnType::tryFrom($column->getDataType());
        $isValid = match ($dataType) {
            ColumnType::Text,
            ColumnType::SingleSelect,
            ColumnType::User,
            ColumnType::Department,
            ColumnType::Attachment,
            ColumnType::Reference => is_string($value),
            ColumnType::Number => is_numeric($value),
            ColumnType::Datetime => is_string($value),
            ColumnType::Boolean => is_bool($value) || $value === 0 || $value === 1 || $value === '0' || $value === '1',
            ColumnType::MultiSelect => is_array($value),
            ColumnType::Json => is_array($value) || is_string($value) || is_object($value),
            default => false,
        };

        if (! $isValid) {
            $this->invalid($column->getColumnKey());
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
