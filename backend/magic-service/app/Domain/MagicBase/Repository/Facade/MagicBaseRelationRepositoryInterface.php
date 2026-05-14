<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseRelationEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;

interface MagicBaseRelationRepositoryInterface
{
    /** @return MagicBaseEntityCollection<MagicBaseRelationEntity> */
    public function listRelations(string $organizationCode, int $projectId): MagicBaseEntityCollection;

    public function getRelation(string $organizationCode, int $projectId, int $relationId): ?MagicBaseRelationEntity;

    public function getRelationByName(string $organizationCode, int $sourceTableId, string $relationName): ?MagicBaseRelationEntity;

    public function saveRelation(MagicBaseRelationEntity $entity): MagicBaseRelationEntity;

    public function deleteRelation(int $relationId): void;
}
