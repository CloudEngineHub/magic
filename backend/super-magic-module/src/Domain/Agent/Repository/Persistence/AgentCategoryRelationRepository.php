<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Repository\Persistence;

use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentCategoryRelationType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentCategoryRelationRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Repository\Persistence\Model\AgentCategoryRelationModel;

class AgentCategoryRelationRepository extends SuperMagicAbstractRepository implements AgentCategoryRelationRepositoryInterface
{
    public function __construct(private readonly AgentCategoryRelationModel $relationModel)
    {
    }

    public function replaceRelations(
        SuperMagicAgentDataIsolation $dataIsolation,
        AgentCategoryRelationType $relationType,
        int $relationId,
        array $categoryIds
    ): void {
        $this->relationModel::withTrashed()
            ->where('relation_type', $relationType->value)
            ->where('relation_id', $relationId)
            ->forceDelete();

        if ($categoryIds === []) {
            return;
        }

        $now = date('Y-m-d H:i:s');
        $rows = [];
        foreach ($categoryIds as $categoryId) {
            $rows[] = [
                'id' => IdGenerator::getSnowId(),
                'organization_code' => $dataIsolation->getCurrentOrganizationCode(),
                'relation_type' => $relationType->value,
                'relation_id' => $relationId,
                'category_id' => $categoryId,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        $this->relationModel::query()->insert($rows);
    }

    public function findCategoryIds(AgentCategoryRelationType $relationType, int $relationId): array
    {
        return $this->relationModel::query()
            ->where('relation_type', $relationType->value)
            ->where('relation_id', $relationId)
            ->orderBy('id')
            ->pluck('category_id')
            ->map(static fn ($categoryId) => (int) $categoryId)
            ->all();
    }

    public function findCategoryIdsByRelationIds(AgentCategoryRelationType $relationType, array $relationIds): array
    {
        $relationIds = array_values(array_unique(array_filter(array_map('intval', $relationIds))));
        if ($relationIds === []) {
            return [];
        }

        $models = $this->relationModel::query()
            ->where('relation_type', $relationType->value)
            ->whereIn('relation_id', $relationIds)
            ->orderBy('id')
            ->get();

        $result = [];
        foreach ($models as $model) {
            $relationId = (int) $model->getAttribute('relation_id');
            $result[$relationId][] = (int) $model->getAttribute('category_id');
        }

        return $result;
    }

    public function deleteByRelationIds(AgentCategoryRelationType $relationType, array $relationIds): int
    {
        $relationIds = array_values(array_unique(array_filter(array_map('intval', $relationIds))));
        if ($relationIds === []) {
            return 0;
        }

        return $this->relationModel::query()
            ->where('relation_type', $relationType->value)
            ->whereIn('relation_id', $relationIds)
            ->delete();
    }
}
