<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Provider\Repository\Persistence;

use App\Domain\Provider\Entity\ModelIdentifierMappingEntity;
use App\Domain\Provider\Entity\ValueObject\ProviderDataIsolation;
use App\Domain\Provider\Entity\ValueObject\Query\ModelIdentifierMappingQuery;
use App\Domain\Provider\Entity\ValueObject\Status;
use App\Domain\Provider\Repository\Facade\ModelIdentifierMappingRepositoryInterface;
use App\Domain\Provider\Repository\Persistence\Model\ModelIdentifierMappingModel;
use App\Infrastructure\Core\AbstractRepository;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Hyperf\Database\Query\Builder;
use Hyperf\DbConnection\Db;

class ModelIdentifierMappingRepository extends AbstractRepository implements ModelIdentifierMappingRepositoryInterface
{
    /**
     * 查询映射组并在数据库层完成分页和组内聚合。
     */
    public function queryGroups(ProviderDataIsolation $dataIsolation, ModelIdentifierMappingQuery $query, Page $page): array
    {
        $baseQuery = $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())->whereNull('deleted_at');
        if ($query->getKeyword() !== '') {
            $baseQuery->where(static function (Builder $builder) use ($query): void {
                $like = '%' . $query->getKeyword() . '%';
                $builder->where('group_name', 'like', $like)
                    ->orWhere('source_model_id', 'like', $like)
                    ->orWhere('target_model_id', 'like', $like);
            });
        }
        if ($query->getStatus() !== null) {
            $baseQuery->where('status', $query->getStatus()->value);
        }

        $total = $page->isTotal()
            ? (clone $baseQuery)->select('group_id')->distinct()->count('group_id')
            : -1;
        $groupIdQuery = (clone $baseQuery)
            ->select('group_id')
            ->groupBy('group_id')
            ->orderByRaw('MAX(id) DESC');
        if ($page->isEnabled()) {
            $groupIdQuery->forPage($page->getPage(), $page->getPageNum());
        }
        $groupIds = $groupIdQuery->pluck('group_id')->all();

        if ($groupIds === []) {
            return ['total' => (int) $total, 'list' => []];
        }

        $rows = $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
            ->whereIn('group_id', $groupIds)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->get()
            ->all();
        $groups = [];
        foreach ($rows as $row) {
            $groupId = (string) $row->group_id;
            if (! isset($groups[$groupId])) {
                $groups[$groupId] = [
                    'group_id' => $groupId,
                    'group_name' => (string) $row->group_name,
                    'target_model_id' => (string) $row->target_model_id,
                    'status' => (int) $row->status,
                    'source_model_ids' => [],
                    'created_at' => $row->created_at?->format('Y-m-d H:i:s'),
                    'updated_at' => $row->updated_at?->format('Y-m-d H:i:s'),
                ];
            }
            $groups[$groupId]['source_model_ids'][] = (string) $row->source_model_id;
        }

        $orderedGroups = [];
        foreach ($groupIds as $groupId) {
            if (isset($groups[(string) $groupId])) {
                $orderedGroups[] = $groups[(string) $groupId];
            }
        }
        return ['total' => (int) $total, 'list' => $orderedGroups];
    }

    /**
     * 查询单个映射组的所有拆分记录。
     */
    public function getByGroupId(ProviderDataIsolation $dataIsolation, string $groupId): array
    {
        return $this->getByGroupIds($dataIsolation, [$groupId])[$groupId] ?? [];
    }

    /**
     * 批量获取多个映射组的拆分记录，并按映射组归集返回。
     */
    public function getByGroupIds(ProviderDataIsolation $dataIsolation, array $groupIds): array
    {
        $groupIds = array_values(array_unique(array_filter($groupIds)));
        if ($groupIds === []) {
            return [];
        }

        $rows = $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
            ->whereIn('group_id', $groupIds)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->get()
            ->all();
        $groups = [];
        foreach ($rows as $row) {
            $groupId = (string) $row->group_id;
            $groups[$groupId] ??= [];
            $groups[$groupId][] = $row;
        }

        foreach ($groups as $groupId => $groupRows) {
            $groups[$groupId] = $this->toEntities($groupRows);
        }
        return $groups;
    }

    /**
     * 查询已经被其他映射组占用的源模型标识。
     */
    public function findConflictingSourceModelIds(ProviderDataIsolation $dataIsolation, array $sourceModelIds, ?string $excludeGroupId = null): array
    {
        if ($sourceModelIds === []) {
            return [];
        }
        $query = $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
            ->whereIn('source_model_id', array_values(array_unique($sourceModelIds)))
            ->whereNull('deleted_at');
        if ($excludeGroupId !== null) {
            $query->where('group_id', '<>', $excludeGroupId);
        }
        return array_values(array_unique(array_map(
            static fn ($row): string => (string) $row->source_model_id,
            $query->get(['source_model_id'])->all()
        )));
    }

    /**
     * 读取全局启用映射，供模型网关解析所有组织的模型标识。
     *
     * @param ProviderDataIsolation $dataIsolation 全局读取时应传入已禁用组织隔离的数据隔离对象
     */
    public function getActiveMappingMap(ProviderDataIsolation $dataIsolation): array
    {
        $builder = $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query());
        $rows = $builder
            ->where('status', Status::Enabled->value)
            ->whereNull('deleted_at')
            ->get(['source_model_id', 'target_model_id'])
            ->all();
        $map = [];
        foreach ($rows as $row) {
            $map[(string) $row->source_model_id] = (string) $row->target_model_id;
        }
        return $map;
    }

    /**
     * 查询源模型候选项，保留禁用模型供旧标识迁移使用。
     */
    public function querySourceOptions(ProviderDataIsolation $dataIsolation, string $keyword, int $limit = 50): array
    {
        // 源模型可以已经停用，候选列表不按状态过滤；已删除模型仍可手工输入标识。
        $query = $this->buildModelOptionsQuery($dataIsolation, $keyword, $limit, null, null, 'model_id', true);
        $options = [];
        foreach ($query->get()->all() as $row) {
            $modelId = (string) $row->model_id;
            $options[$modelId] ??= $this->formatModelOption($row, true);
        }
        return array_values($options);
    }

    /**
     * 查询当前可用且不是动态模型的目标候选项。
     */
    public function queryTargetOptions(ProviderDataIsolation $dataIsolation, string $keyword, int $limit = 50): array
    {
        $query = $this->buildModelOptionsQuery(
            $dataIsolation,
            $keyword,
            $limit,
            Status::Enabled->value,
            'DYNAMIC',
            'name',
        );
        $options = [];
        foreach ($query->get()->all() as $row) {
            $options[(string) $row->model_id] = $this->formatModelOption($row);
        }
        return array_values($options);
    }

    /**
     * 构建模型候选项的公共查询条件。
     */
    private function buildModelOptionsQuery(
        ProviderDataIsolation $dataIsolation,
        string $keyword,
        int $limit,
        ?int $status,
        ?string $excludedType,
        string $orderBy,
        bool $distinct = false,
    ): Builder {
        $query = Db::table('service_provider_models')
            ->where('organization_code', $dataIsolation->getCurrentOrganizationCode())
            ->whereNull('deleted_at')
            ->select('model_id', 'name', 'icon', 'status', 'type')
            ->orderBy($orderBy)
            ->limit($limit);
        if ($status !== null) {
            $query->where('status', $status);
        }
        if ($excludedType !== null) {
            $query->where('type', '<>', $excludedType);
        }
        if ($distinct) {
            $query->distinct();
        }
        if ($keyword !== '') {
            $query->where(static function (Builder $builder) use ($keyword): void {
                $like = '%' . $keyword . '%';
                $builder->where('model_id', 'like', $like)->orWhere('name', 'like', $like);
            });
        }
        return $query;
    }

    /**
     * 将模型查询记录转换为候选项数据。
     */
    private function formatModelOption(object $row, bool $fallbackNameToModelId = false): array
    {
        $modelId = (string) $row->model_id;
        return [
            'model_id' => $modelId,
            'name' => $fallbackNameToModelId ? (string) ($row->name ?? $modelId) : (string) ($row->name ?? ''),
            'icon' => (string) ($row->icon ?? ''),
            'status' => (int) ($row->status ?? 0),
            'type' => (string) ($row->type ?? ''),
        ];
    }

    /**
     * 事务保存一个映射组，并将每个源标识拆成独立记录。
     */
    public function saveGroup(ProviderDataIsolation $dataIsolation, string $groupId, string $groupName, string $targetModelId, array $sourceModelIds): array
    {
        return Db::transaction(function () use ($dataIsolation, $groupId, $groupName, $targetModelId, $sourceModelIds): array {
            $now = date('Y-m-d H:i:s');
            $existingStatus = $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
                ->where('group_id', $groupId)
                ->whereNull('deleted_at')
                ->value('status');
            $groupStatus = $existingStatus === null ? Status::Enabled->value : (int) $existingStatus;
            // 锁定已有源标识，确保并发保存至少一方得到冲突结果。
            $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
                ->whereIn('source_model_id', $sourceModelIds)
                ->whereNull('deleted_at')
                ->lockForUpdate()
                ->get(['id']);

            $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
                ->where('group_id', $groupId)
                ->whereNull('deleted_at')
                ->update(['deleted_at' => $now, 'updated_at' => $now]);

            $rows = [];
            foreach ($sourceModelIds as $sourceModelId) {
                $rows[] = [
                    'id' => IdGenerator::getSnowId(),
                    'group_id' => $groupId,
                    'group_name' => $groupName,
                    'source_model_id' => $sourceModelId,
                    'target_model_id' => $targetModelId,
                    'status' => $groupStatus,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())->insert($rows);
            return $this->getByGroupId($dataIsolation, $groupId);
        });
    }

    /**
     * 更新单个映射组状态。
     */
    public function updateGroupStatus(ProviderDataIsolation $dataIsolation, string $groupId, int $status): void
    {
        $this->updateGroupsStatus($dataIsolation, [$groupId], $status);
    }

    /**
     * 批量更新映射组状态。
     */
    public function updateGroupsStatus(ProviderDataIsolation $dataIsolation, array $groupIds, int $status): void
    {
        if ($groupIds === []) {
            return;
        }
        $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
            ->whereIn('group_id', array_values(array_unique($groupIds)))
            ->whereNull('deleted_at')
            ->update(['status' => $status, 'updated_at' => date('Y-m-d H:i:s')]);
    }

    /**
     * 删除单个映射组的有效记录。
     */
    public function deleteGroup(ProviderDataIsolation $dataIsolation, string $groupId): void
    {
        $this->deleteGroups($dataIsolation, [$groupId]);
    }

    /**
     * 批量软删除映射组的有效记录。
     */
    public function deleteGroups(ProviderDataIsolation $dataIsolation, array $groupIds): void
    {
        if ($groupIds === []) {
            return;
        }
        $now = date('Y-m-d H:i:s');
        $this->createBuilder($dataIsolation, ModelIdentifierMappingModel::query())
            ->whereIn('group_id', array_values(array_unique($groupIds)))
            ->whereNull('deleted_at')
            ->update(['deleted_at' => $now, 'updated_at' => $now]);
    }

    /**
     * 将持久化记录转换为领域实体。
     *
     * @param array<int, object|array<string, mixed>> $rows
     * @return ModelIdentifierMappingEntity[]
     */
    private function toEntities(array $rows): array
    {
        return array_map(static function ($row): ModelIdentifierMappingEntity {
            $data = is_array($row)
                ? $row
                : (method_exists($row, 'getAttributes') ? $row->getAttributes() : get_object_vars($row));
            return (new ModelIdentifierMappingEntity())
                ->setId($data['id'] ?? null)
                ->setGroupId((string) ($data['group_id'] ?? ''))
                ->setGroupName((string) ($data['group_name'] ?? ''))
                ->setSourceModelId((string) ($data['source_model_id'] ?? ''))
                ->setTargetModelId((string) ($data['target_model_id'] ?? ''))
                ->setStatus((int) ($data['status'] ?? Status::Enabled->value))
                ->setCreatedAt($data['created_at'] ?? null)
                ->setUpdatedAt($data['updated_at'] ?? null)
                ->setDeletedAt($data['deleted_at'] ?? null);
        }, $rows);
    }
}
