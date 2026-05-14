<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseRelationEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use DateTime;

class MagicBaseRelationDomainService
{
    public function validate(string $relationType, string $relationName): void
    {
        if (! in_array($relationType, MagicBaseConst::RELATION_TYPES, true)) {
            $this->invalid('关系类型');
        }
        if ($relationName === '') {
            MagicBaseExceptionBuilder::parameterMissing('关系名称');
        }
    }

    public function buildCreatePayload(string $organizationCode, int $projectId, int $sourceTableId, string $sourceColumnKey, int $targetTableId, string $targetColumnKey, string $relationType, string $relationName): MagicBaseRelationEntity
    {
        $this->validate($relationType, $relationName);
        $now = new DateTime();
        return new MagicBaseRelationEntity([
            'organization_code' => $organizationCode,
            'project_id' => $projectId,
            'source_table_id' => $sourceTableId,
            'source_column_key' => $sourceColumnKey,
            'target_table_id' => $targetTableId,
            'target_column_key' => $targetColumnKey,
            'relation_type' => $relationType,
            'relation_name' => $relationName,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function applyUpdate(MagicBaseRelationEntity $relation, int $sourceTableId, int $targetTableId, string $relationType, string $relationName): MagicBaseRelationEntity
    {
        $this->validate($relationType, $relationName);
        $relation->setSourceTableId($sourceTableId);
        $relation->setTargetTableId($targetTableId);
        $relation->setRelationType($relationType);
        $relation->setRelationName($relationName);
        $relation->setUpdatedAt(new DateTime());
        return $relation;
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::relationInvalid($label);
    }
}
