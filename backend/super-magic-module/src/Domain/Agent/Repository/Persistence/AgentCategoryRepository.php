<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Repository\Persistence;

use Dtyq\SuperMagic\Domain\Agent\Entity\AgentCategoryEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentCategoryQuery;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentCategoryRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Repository\Persistence\Model\AgentCategoryModel;

class AgentCategoryRepository extends SuperMagicAbstractRepository implements AgentCategoryRepositoryInterface
{
    public function __construct(private readonly AgentCategoryModel $categoryModel)
    {
    }

    public function findById(int $id): ?AgentCategoryEntity
    {
        /** @var null|AgentCategoryModel $model */
        $model = $this->categoryModel::query()->find($id);
        return $model === null ? null : new AgentCategoryEntity($model->toArray());
    }

    public function findByIds(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids)));
        if ($ids === []) {
            return [];
        }

        $models = $this->categoryModel::query()
            ->whereIn('id', $ids)
            ->get();

        return $models
            ->map(static fn (AgentCategoryModel $model) => new AgentCategoryEntity($model->toArray()))
            ->all();
    }

    public function findByQuery(AgentCategoryQuery $query): array
    {
        $builder = $this->categoryModel::query();

        if ($query->getStatus() !== null) {
            $builder->where('status', $query->getStatus());
        }

        $keyword = trim((string) $query->getKeyword());
        if ($keyword !== '') {
            $builder->where('name_i18n', 'LIKE', '%' . $keyword . '%');
        }

        $models = $builder
            ->orderBy('sort_order', 'DESC')
            ->orderBy('created_at', 'ASC')
            ->get();

        return $models
            ->map(static fn (AgentCategoryModel $model) => new AgentCategoryEntity($model->toArray()))
            ->all();
    }

    public function findEnabled(): array
    {
        $models = $this->categoryModel::query()
            ->where('status', 1)
            ->orderBy('sort_order', 'DESC')
            ->orderBy('created_at', 'ASC')
            ->get();

        return $models
            ->map(static fn (AgentCategoryModel $model) => new AgentCategoryEntity($model->toArray()))
            ->all();
    }

    public function save(AgentCategoryEntity $entity): AgentCategoryEntity
    {
        $model = $entity->getId() === null
            ? new AgentCategoryModel()
            : $this->categoryModel::query()->find($entity->getId());
        $model ??= new AgentCategoryModel();
        $model->fill($this->getAttributes($entity));
        $model->save();
        return new AgentCategoryEntity($model->toArray());
    }

    public function deleteById(int $id): bool
    {
        /** @var null|AgentCategoryModel $model */
        $model = $this->categoryModel::query()->find($id);
        return $model !== null && $model->delete();
    }

    public function findAll(): array
    {
        $models = $this->categoryModel::query()
            ->orderBy('sort_order', 'DESC')
            ->orderBy('created_at', 'ASC')
            ->get();

        return $models
            ->map(static fn (AgentCategoryModel $model) => new AgentCategoryEntity($model->toArray()))
            ->all();
    }
}
