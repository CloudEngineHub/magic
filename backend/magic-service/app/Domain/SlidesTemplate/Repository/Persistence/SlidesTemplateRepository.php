<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Repository\Persistence;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagMatch;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagStatus;
use App\Domain\SlidesTemplate\Factory\SlidesTemplateFactory;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateRepositoryInterface;
use App\Domain\SlidesTemplate\Repository\Persistence\Model\SlidesTemplateModel;
use App\Infrastructure\Core\AbstractRepository;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Carbon\Carbon;
use Hyperf\Database\Model\Builder;
use Hyperf\DbConnection\Db;

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
        $builder = $this->createQueryBuilder($dataIsolation, $query);
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

    public function count(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): int
    {
        return $this->createQueryBuilder($dataIsolation, $query)->count();
    }

    public function sumTotalUsageCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): int
    {
        return (int) $this->createQueryBuilder($dataIsolation, $query)->sum('total_usage_count');
    }

    public function countTodayCreated(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): int
    {
        return $this->createQueryBuilder($dataIsolation, $query)
            ->where('status', SlidesTemplateStatus::Enabled->value)
            ->whereDate('created_at', Carbon::today()->toDateString())
            ->count();
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

    public function incrementActualUsageCount(SlidesTemplateDataIsolation $dataIsolation, string $code, int $totalUsageIncrement): bool
    {
        $totalUsageIncrement = max(1, $totalUsageIncrement);

        return $this->createBuilder($dataIsolation, SlidesTemplateModel::query())
            ->where('code', $code)
            ->update([
                'actual_usage_count' => Db::raw('actual_usage_count + 1'),
                'total_usage_count' => Db::raw(sprintf('total_usage_count + %d', $totalUsageIncrement)),
            ]) > 0;
    }

    public function updateBaseUsageCount(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $baseUsageCount, int $totalUsageCount, string $updatedUid): bool
    {
        return $this->createBuilder($dataIsolation, SlidesTemplateModel::query())
            ->where('id', $id)
            ->update([
                'base_usage_count' => max(0, $baseUsageCount),
                'total_usage_count' => max(0, $totalUsageCount),
                'updated_uid' => $updatedUid,
            ]) > 0;
    }

    /**
     * @return SlidesTemplateEntity[]
     */
    public function findRankedForUsageCount(SlidesTemplateDataIsolation $dataIsolation, int $offset, int $limit): array
    {
        $models = $this->createBuilder($dataIsolation, SlidesTemplateModel::query())
            ->orderBy('sort', 'desc')
            ->orderBy('id', 'desc')
            ->offset($offset)
            ->limit($limit)
            ->get();

        $list = [];
        foreach ($models as $model) {
            /* @var SlidesTemplateModel $model */
            $list[] = SlidesTemplateFactory::modelToEntity($model);
        }
        return $list;
    }

    public function countForUsageCount(SlidesTemplateDataIsolation $dataIsolation): int
    {
        return $this->createBuilder($dataIsolation, SlidesTemplateModel::query())->count();
    }

    public function updateUsageCounts(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $baseUsageCount, int $totalUsageCount): bool
    {
        return $this->createBuilder($dataIsolation, SlidesTemplateModel::query())
            ->where('id', $id)
            ->update([
                'base_usage_count' => max(0, $baseUsageCount),
                'total_usage_count' => max(0, $totalUsageCount),
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
        $model = $builder->where('code', $code)->first();

        return $model instanceof SlidesTemplateModel ? $model : null;
    }

    private function createQueryBuilder(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): Builder
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

        $this->applyTagFilter($builder, $query);

        return $builder;
    }

    private function applyTagFilter($builder, SlidesTemplateQuery $query): void
    {
        $tagCodes = $query->getTagCodes();
        if ($tagCodes === []) {
            return;
        }

        if ($query->getTagMatch() === SlidesTemplateTagMatch::All) {
            foreach ($tagCodes as $tagCode) {
                $this->whereHasEnabledTag($builder, [$tagCode]);
            }
            return;
        }

        $this->whereHasEnabledTag($builder, $tagCodes);
    }

    private function whereHasEnabledTag($builder, array $tagCodes): void
    {
        $builder->whereExists(static function ($subQuery) use ($tagCodes): void {
            $subQuery->selectRaw('1')
                ->from('magic_slides_template_tag_relations AS r')
                ->join('magic_slides_template_tags AS tag', 'tag.id', '=', 'r.tag_id')
                ->whereColumn('r.template_id', 'magic_slides_templates.id')
                ->whereColumn('r.organization_code', 'magic_slides_templates.organization_code')
                ->whereIn('tag.code', $tagCodes)
                ->where('tag.node_type', 'tag')
                ->where('tag.status', SlidesTemplateTagStatus::Enabled->value)
                ->whereNull('tag.deleted_at');
        });
    }
}
