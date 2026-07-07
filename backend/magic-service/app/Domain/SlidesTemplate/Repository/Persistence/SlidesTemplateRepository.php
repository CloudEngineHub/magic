<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Repository\Persistence;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Factory\SlidesTemplateFactory;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateRepositoryInterface;
use App\Domain\SlidesTemplate\Repository\Persistence\Model\SlidesTemplateModel;
use App\Infrastructure\Core\AbstractRepository;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\IdGenerator\IdGenerator;

class SlidesTemplateRepository extends AbstractRepository implements SlidesTemplateRepositoryInterface
{
    protected bool $filterOrganizationCode = true;

    public function findById(SlidesTemplateDataIsolation $dataIsolation, int|string $id): ?SlidesTemplateEntity
    {
        $builder = $this->createBuilder($dataIsolation, SlidesTemplateModel::query());
        /** @var null|SlidesTemplateModel $model */
        $model = $builder->where('id', $id)->first();

        return $model ? SlidesTemplateFactory::modelToEntity($model) : null;
    }

    public function findByCode(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateEntity
    {
        $model = $this->findModelByCode($dataIsolation, $code, false);

        return $model ? SlidesTemplateFactory::modelToEntity($model) : null;
    }

    public function findByCodeWithTrashed(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateEntity
    {
        $model = $this->findModelByCode($dataIsolation, $code, true);

        return $model ? SlidesTemplateFactory::modelToEntity($model) : null;
    }

    public function queries(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query, Page $page): array
    {
        $builder = $this->createBuilder($dataIsolation, SlidesTemplateModel::query());

        if ($query->getCode() !== null) {
            $builder->where('code', $query->getCode());
        }

        if ($query->getCategoryCode() !== null) {
            $builder->where('category_code', $query->getCategoryCode());
        }

        if ($query->getStatus() !== null) {
            $builder->where('status', $query->getStatus());
        }

        if ($query->getKeyword() !== null) {
            $keyword = mb_strtolower($query->getKeyword(), 'UTF-8');
            $keywordLike = '%' . addcslashes($keyword, '\%_') . '%';
            $builder->where('search_text', 'LIKE', $keywordLike);
        }

        $builder->orderBy('sort', 'desc')->orderBy('id', 'desc');

        $data = $this->getByPage($builder, $page);
        $list = [];
        foreach ($data['list'] as $model) {
            /* @var SlidesTemplateModel $model */
            $list[] = SlidesTemplateFactory::modelToEntity($model);
        }
        $data['list'] = $list;

        return $data;
    }

    public function save(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateEntity $entity): SlidesTemplateEntity
    {
        if ($entity->getOrganizationCode() === '') {
            $entity->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        }

        if ($entity->getId() === null) {
            $id = IdGenerator::getSnowId();
            $model = new SlidesTemplateModel();
            $model->id = $id;
        } else {
            /** @var null|SlidesTemplateModel $model */
            $model = $this->createBuilder($dataIsolation, SlidesTemplateModel::withTrashed())
                ->where('id', $entity->getId())
                ->first();
            if (! $model) {
                $model = new SlidesTemplateModel();
            }
        }

        if ($model->trashed()) {
            $model->restore();
        }
        $model->fill($this->getAttributes($entity));
        $model->save();

        $entity->setId($model->id);
        return SlidesTemplateFactory::modelToEntity($model);
    }

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $status, string $updatedUid): bool
    {
        return $this->createBuilder($dataIsolation, SlidesTemplateModel::query())
            ->where('id', $id)
            ->update([
                'status' => $status,
                'updated_uid' => $updatedUid,
            ]) > 0;
    }

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): bool
    {
        return $this->createBuilder($dataIsolation, SlidesTemplateModel::query())
            ->where('id', $id)
            ->update([
                'sort' => $sort,
                'updated_uid' => $updatedUid,
            ]) > 0;
    }

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): bool
    {
        /** @var null|SlidesTemplateModel $model */
        $model = $this->createBuilder($dataIsolation, SlidesTemplateModel::query())
            ->where('id', $id)
            ->first();

        return $model !== null && (bool) $model->delete();
    }

    private function findModelByCode(SlidesTemplateDataIsolation $dataIsolation, string $code, bool $withTrashed): ?SlidesTemplateModel
    {
        $query = $withTrashed ? SlidesTemplateModel::withTrashed() : SlidesTemplateModel::query();
        $builder = $this->createBuilder($dataIsolation, $query);
        /** @var null|SlidesTemplateModel $model */
        return $builder->where('code', $code)->first();
    }
}
