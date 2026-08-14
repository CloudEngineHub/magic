<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Repository\Facade;

use App\Domain\SuperMagic\Agent\Entity\ValueObject\AgentCategoryRelationType;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;

interface AgentCategoryRelationRepositoryInterface
{
    /** @param int[] $categoryIds */
    public function replaceRelations(
        SuperMagicAgentDataIsolation $dataIsolation,
        AgentCategoryRelationType $relationType,
        int $relationId,
        array $categoryIds
    ): void;

    /** @return int[] */
    public function findCategoryIds(AgentCategoryRelationType $relationType, int $relationId): array;

    /**
     * @param int[] $relationIds
     * @return array<int, int[]>
     */
    public function findCategoryIdsByRelationIds(AgentCategoryRelationType $relationType, array $relationIds): array;

    /** @param int[] $relationIds */
    public function deleteByRelationIds(AgentCategoryRelationType $relationType, array $relationIds): int;
}
