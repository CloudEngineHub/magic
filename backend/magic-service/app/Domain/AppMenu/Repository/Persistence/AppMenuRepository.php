<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\AppMenu\Repository\Persistence;

use App\Domain\AppMenu\Entity\AppMenuEntity;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuSourceType;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use App\Domain\AppMenu\Factory\AppMenuFactory;
use App\Domain\AppMenu\Repository\Facade\AppMenuRepositoryInterface;
use App\Domain\AppMenu\Repository\Persistence\Model\AppMenuModel;
use App\Domain\AppMenu\Repository\Persistence\Model\AppMenuOrganizationOverrideModel;
use App\Infrastructure\Core\ValueObject\Page;
use RuntimeException;

/**
 * 应用菜单持久化仓储。
 *
 * `magic_applications` 保存菜单本体；`magic_application_organization_overrides`
 * 只保存非官方组织对官方菜单的本组织状态/排序覆盖。
 */
class AppMenuRepository implements AppMenuRepositoryInterface
{
    public function getById(int $id): ?AppMenuEntity
    {
        /** @var null|AppMenuModel $model */
        $model = AppMenuModel::query()->where('id', $id)->first();

        return $model ? AppMenuFactory::createEntity($model) : null;
    }

    public function getByIdForOrganization(int $id, string $organizationCode, bool $isOfficialOrganization): ?AppMenuEntity
    {
        /** @var null|AppMenuModel $model */
        $model = $this->createOrganizationBuilder($organizationCode, $isOfficialOrganization)
            ->where('magic_applications.id', $id)
            ->first();

        return $model ? AppMenuFactory::createEntity($model) : null;
    }

    public function getByPath(string $appPath): ?AppMenuEntity
    {
        /** @var null|AppMenuModel $model */
        $model = AppMenuModel::query()->where('path', $appPath)->first();

        return $model ? AppMenuFactory::createEntity($model) : null;
    }

    /**
     * @param array{name?: string, display_scope?: int} $filters
     * @return array{total: int, list: array<AppMenuEntity>}
     */
    public function queries(array $filters, Page $page): array
    {
        $builder = AppMenuModel::query();

        $this->applyFilters($builder, $filters);

        $builder->orderBy('sort_order', 'desc')
            ->orderBy('id', 'desc');

        return $this->paginate($builder, $page);
    }

    public function queriesForOrganization(string $organizationCode, bool $isOfficialOrganization, array $filters, Page $page): array
    {
        // 组织视角列表：官方组织只看官方菜单；非官方组织看官方菜单和本组织自建菜单合集。
        $builder = $this->createOrganizationBuilder($organizationCode, $isOfficialOrganization);
        $this->applyFilters($builder, $filters, ! $isOfficialOrganization);
        $this->applyEffectiveOrder($builder, ! $isOfficialOrganization);

        return $this->paginate($builder, $page);
    }

    public function save(AppMenuEntity $entity): AppMenuEntity
    {
        if (! $entity->getId()) {
            $model = new AppMenuModel();
        } else {
            /** @var null|AppMenuModel $model */
            $model = AppMenuModel::query()->where('id', $entity->getId())->first();
            if (! $model) {
                throw new RuntimeException('App menu not found.');
            }
        }

        $model->fill($this->entityToAttributes($entity));
        $model->save();

        $entity->setId($model->id);

        return $entity;
    }

    public function delete(int $id): bool
    {
        $model = AppMenuModel::query()->where('id', $id)->first();
        if ($model === null) {
            return false;
        }
        $model->forceDelete();
        return true;
    }

    public function saveOfficialOrganizationOverride(int $appMenuId, string $organizationCode, int $status, int $sortOrder, string $creatorId): void
    {
        // 非官方组织不能修改官方菜单本体，只能在覆盖表保存本组织的状态和排序。
        /** @var null|AppMenuOrganizationOverrideModel $model */
        $model = AppMenuOrganizationOverrideModel::withTrashed()
            ->where('app_menu_id', $appMenuId)
            ->where('organization_code', $organizationCode)
            ->first();

        if ($model === null) {
            $model = new AppMenuOrganizationOverrideModel();
            $model->app_menu_id = $appMenuId;
            $model->organization_code = $organizationCode;
            $model->creator_id = $creatorId;
        }

        $model->sort_order = $sortOrder;
        $model->status = $status;
        $model->deleted_at = null;
        $model->save();
    }

    /**
     * @param array<int> $displayScopes
     * @return array<AppMenuEntity>
     */
    public function getAllEnabled(array $displayScopes): array
    {
        if ($displayScopes === []) {
            return [];
        }

        /** @var array<AppMenuModel> $models */
        $models = AppMenuModel::query()
            ->where('source_type', AppMenuSourceType::Official->value)
            ->where('status', AppMenuStatus::Enabled->value)
            ->whereIn('display_scope', $displayScopes)
            ->orderBy('sort_order', 'desc')
            ->orderBy('id', 'desc')
            ->get()
            ->all();

        return $this->modelsToEntities($models);
    }

    public function getAllEnabledForOrganization(string $organizationCode, array $displayScopes): array
    {
        if ($displayScopes === []) {
            return [];
        }

        // 用户侧入口使用有效状态和有效排序：有组织覆盖时用覆盖值，否则回退菜单本体值。
        $builder = $this->createOrganizationBuilder($organizationCode, false);
        $builder->whereIn('magic_applications.display_scope', $displayScopes);
        $this->applyEffectiveStatusFilter($builder, AppMenuStatus::Enabled->value);
        $this->applyEffectiveOrder($builder, true);

        /** @var array<AppMenuModel> $models */
        $models = $builder->get()->all();

        return $this->modelsToEntities($models);
    }

    private function modelsToEntities(array $models): array
    {
        $entities = [];

        foreach ($models as $model) {
            $entities[] = AppMenuFactory::createEntity($model);
        }

        return $entities;
    }

    private function createOrganizationBuilder(string $organizationCode, bool $isOfficialOrganization)
    {
        $builder = AppMenuModel::query()
            ->from('magic_applications')
            ->select('magic_applications.*');

        if ($isOfficialOrganization) {
            return $builder->where('magic_applications.source_type', AppMenuSourceType::Official->value);
        }

        // 非官方组织需要带出官方菜单在当前组织下的覆盖状态/排序。
        $builder->leftJoin('magic_application_organization_overrides as app_menu_overrides', function ($join) use ($organizationCode): void {
            $join->on('app_menu_overrides.app_menu_id', '=', 'magic_applications.id')
                ->where('app_menu_overrides.organization_code', '=', $organizationCode)
                ->whereNull('app_menu_overrides.deleted_at');
        });

        $builder->addSelect([
            'app_menu_overrides.status as organization_status',
            'app_menu_overrides.sort_order as organization_sort_order',
        ]);

        // 非官方组织可见的数据集为：官方已启用菜单 + 当前组织自建菜单。
        // 官方菜单本体状态是全局发布开关，组织覆盖只能在已发布菜单上调整本组织显示/隐藏。
        return $builder->where(function ($query) use ($organizationCode): void {
            $query->where(function ($officialQuery): void {
                $officialQuery->where('magic_applications.source_type', AppMenuSourceType::Official->value)
                    ->where('magic_applications.status', AppMenuStatus::Enabled->value);
            })
                ->orWhere(function ($subQuery) use ($organizationCode): void {
                    $subQuery->where('magic_applications.source_type', AppMenuSourceType::Organization->value)
                        ->where('magic_applications.organization_code', $organizationCode);
                });
        });
    }

    private function applyFilters($builder, array $filters, bool $useEffectiveStatus = false): void
    {
        if (! empty($filters['name'])) {
            $keyword = '%' . $filters['name'] . '%';
            $builder->where(function ($q) use ($keyword): void {
                $q->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(magic_applications.name_i18n, '$.zh_CN')) LIKE ?", [$keyword])
                    ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(magic_applications.name_i18n, '$.en_US')) LIKE ?", [$keyword])
                    ->orWhere('magic_applications.path', 'like', $keyword);
            });
        }

        if (array_key_exists('display_scope', $filters) && $filters['display_scope'] !== null) {
            $builder->where('magic_applications.display_scope', $filters['display_scope']);
        }

        if (array_key_exists('source_type', $filters) && $filters['source_type'] !== null) {
            $builder->where('magic_applications.source_type', $filters['source_type']);
        }

        if (array_key_exists('status', $filters) && $filters['status'] !== null) {
            if ($useEffectiveStatus) {
                $this->applyEffectiveStatusFilter($builder, (int) $filters['status']);
                return;
            }

            $builder->where('magic_applications.status', $filters['status']);
        }
    }

    private function applyEffectiveStatusFilter($builder, int $status): void
    {
        // 有覆盖状态时按覆盖状态筛选；没有覆盖状态时按菜单本体状态筛选。
        $builder->where(function ($query) use ($status): void {
            $query->where(function ($query) use ($status): void {
                $query->whereNotNull('app_menu_overrides.status')
                    ->where('app_menu_overrides.status', $status);
            })->orWhere(function ($query) use ($status): void {
                $query->whereNull('app_menu_overrides.status')
                    ->where('magic_applications.status', $status);
            });
        });
    }

    private function applyEffectiveOrder($builder, bool $useOverride): void
    {
        if ($useOverride) {
            // 非官方组织排序优先使用组织覆盖值，没有覆盖时回退菜单本体排序。
            $builder->orderByRaw('COALESCE(app_menu_overrides.sort_order, magic_applications.sort_order) desc')
                ->orderBy('magic_applications.id', 'desc');
            return;
        }

        $builder->orderBy('magic_applications.sort_order', 'desc')
            ->orderBy('magic_applications.id', 'desc');
    }

    private function paginate($builder, Page $page): array
    {
        if (! $page->isEnabled()) {
            /** @var array<AppMenuModel> $models */
            $models = $builder->get()->all();

            return [
                'total' => count($models),
                'list' => $this->modelsToEntities($models),
            ];
        }

        $total = $page->isTotal() ? $builder->count() : -1;
        $models = [];
        if (! $page->isTotal() || $total > 0) {
            /** @var array<AppMenuModel> $models */
            $models = $builder->forPage($page->getPage(), $page->getPageNum())->get()->all();
        }

        return [
            'total' => $total,
            'list' => $this->modelsToEntities($models),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function entityToAttributes(AppMenuEntity $entity): array
    {
        return [
            'id' => $entity->getId(),
            'organization_code' => $entity->getOrganizationCode(),
            'source_type' => $entity->getSourceType(),
            'name_i18n' => $entity->getNameI18n(),
            'icon' => $entity->getIcon(),
            'icon_url' => $entity->getIconUrl(),
            'icon_type' => $entity->getIconType(),
            'path' => $entity->getPath(),
            'open_method' => $entity->getOpenMethod(),
            'sort_order' => $entity->getSortOrder(),
            'display_scope' => $entity->getDisplayScope(),
            'status' => $entity->getStatus(),
            'creator_id' => $entity->getCreatorId(),
            'created_at' => $entity->getCreatedAt(),
            'updated_at' => $entity->getUpdatedAt(),
        ];
    }
}
