<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Repository\Persistence;

use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\ValueObject\AssetScope;
use App\Domain\Asset\Entity\ValueObject\AssetSyncStatus;
use App\Domain\Asset\Entity\ValueObject\Query\AssetQuery;
use App\Domain\Asset\Repository\Facade\AssetRepositoryInterface;
use App\Domain\Asset\Repository\Persistence\Model\AssetModel;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Hyperf\Database\Model\Builder;

class AssetRepository implements AssetRepositoryInterface
{
    public function __construct(protected AssetModel $assetModel)
    {
    }

    public function save(AssetDataIsolation $dataIsolation, AssetEntity $asset): AssetEntity
    {
        if ($asset->getOrganizationCode() === '') {
            $asset->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        }

        $model = $asset->getId() === null
            ? new AssetModel()
            : $this->assetModel::query()
                ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
                ->where('id', $asset->getId())
                ->first();
        if ($model === null) {
            $model = new AssetModel();
        }
        if ($asset->getId() === null) {
            $asset->setId(IdGenerator::getSnowId());
        }
        $payload = $asset->toArray();
        $now = date('Y-m-d H:i:s');
        if ($payload['created_at'] === null) {
            $payload['created_at'] = $now;
        }
        $payload['updated_at'] = $now;
        $model->fill($payload);
        $model->save();
        return new AssetEntity($model->toArray());
    }

    public function queries(
        AssetDataIsolation $dataIsolation,
        AssetQuery $query,
        Page $page,
    ): array {
        $builder = $this->assetModel::query();
        $builder->whereIn('organization_code', $dataIsolation->getOrganizationCodes());
        $this->applyScopeFilter($builder, $dataIsolation, $query);
        if ($query->getAssetKind() !== null) {
            $builder->where('asset_kind', $query->getAssetKind());
        }
        if ($query->getParentId() !== null) {
            $builder->where('parent_id', $query->getParentId());
        } else {
            // 未指定父组时仅返回第一层资产，便于组与独立资产统一分页。
            $builder->whereNull('parent_id');
        }
        if ($query->getAssetBusinessType() !== null) {
            $builder->where('asset_business_type', $query->getAssetBusinessType());
        }
        if ($query->getAssetMediaType() !== null) {
            $builder->where('asset_media_type', $query->getAssetMediaType());
        }
        if ($query->getKeyword() !== null) {
            $builder->where('search_text', 'like', '%' . $query->getKeyword() . '%');
        }
        if ($query->getStatus() !== null) {
            $builder->where('status', $query->getStatus());
        }
        if ($query->isVerified() === true) {
            $builder->where('sync_status', AssetSyncStatus::SYNCED->value);
        }
        if ($query->getOwnerUids() !== []) {
            $builder->whereIn('owner_uid', $query->getOwnerUids());
        }
        if ($query->getTagIds() !== []) {
            $relationTable = 'magic_asset_tag_relations';
            $organizationCode = $dataIsolation->getCurrentOrganizationCode();
            $builder->whereIn('id', static function ($subQuery) use ($relationTable, $query, $organizationCode): void {
                $subQuery->from($relationTable)
                    ->select('asset_id')
                    ->where('organization_code', $organizationCode)
                    ->whereIn('tag_id', $query->getTagIds())
                    ->groupBy('asset_id')
                    ->havingRaw(
                        'COUNT(DISTINCT tag_id) ' . ($query->getTagMatch() === 'all' ? '>=' : '>') . ' ?',
                        [$query->getTagMatch() === 'all' ? count($query->getTagIds()) : 0]
                    );
            });
        }

        $total = (int) $builder->count();
        $builder->orderBy('created_at', 'desc')->orderBy('id', 'desc');
        $list = $page->isEnabled()
            ? $builder->offset($page->getSliceStart())->limit($page->getPageNum())->get()
            : $builder->get();
        return [
            'total' => $total,
            'list' => array_map(
                static fn (AssetModel $model): AssetEntity => new AssetEntity($model->toArray()),
                $list->all(),
            ),
        ];
    }

    public function findById(AssetDataIsolation $dataIsolation, int|string $id): ?AssetEntity
    {
        $builder = $this->assetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->where('id', $id);
        $model = $builder->first();
        return $model === null ? null : new AssetEntity($model->toArray());
    }

    public function findOwnerUidsByIds(AssetDataIsolation $dataIsolation, array $assetIds): array
    {
        if ($assetIds === []) {
            return [];
        }
        return $this->assetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->whereIn('id', $assetIds)
            ->whereNotNull('owner_uid')
            ->distinct()
            ->pluck('owner_uid')
            ->map(static fn ($uid): string => (string) $uid)
            ->all();
    }

    public function findIdsByOwnerUid(AssetDataIsolation $dataIsolation, string $ownerUid): array
    {
        return $this->assetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->where('owner_uid', $ownerUid)
            ->pluck('id')
            ->map(static fn ($id): string => (string) $id)
            ->all();
    }

    public function batchUpdateOwner(AssetDataIsolation $dataIsolation, array $assetIds, string $ownerUid): int
    {
        if ($assetIds === []) {
            return 0;
        }
        return $this->assetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->whereIn('id', $assetIds)
            ->update([
                'owner_uid' => $ownerUid,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
    }

    /**
     * 按内容指纹查存活素材主键，用于复用第三方素材。
     *
     * 第三方素材是全局资源：同一份内容各组织各建一条本地记录、共用同一个 provider_asset_id，
     * 因此这里刻意不按 organization_code 过滤——这正是「同一张图片只上传一次」能生效的前提。
     * 返回的可能是别的组织/Bucket 的记录，调用方据此复用它们已经过审的第三方凭证即可。
     *
     * @return int[]
     */
    public function findIdsByContentHash(string $contentHash, int $limit = 20): array
    {
        if ($contentHash === '') {
            return [];
        }
        return $this->assetModel::query()
            ->where('content_hash', $contentHash)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    public function findPersonalAssetByContentHash(string $userId, string $contentHash, bool $anySyncStatus = false): ?AssetEntity
    {
        if ($userId === '' || $contentHash === '') {
            return null;
        }
        $builder = $this->assetModel::query()
            ->where('user_id', $userId)
            ->where('content_hash', $contentHash)
            ->whereNull('deleted_at');
        if (! $anySyncStatus) {
            $builder->where('sync_status', AssetSyncStatus::SYNCED->value);
        }
        $model = $builder->orderBy('id', $anySyncStatus ? 'desc' : 'asc')->first();
        return $model === null ? null : new AssetEntity($model->toArray());
    }

    /**
     * 是否还有未删除的直接子级（素材或子组）；它是删除素材组前的硬性检查。
     */
    public function hasChildren(AssetDataIsolation $dataIsolation, int|string $assetId): bool
    {
        return (bool) $this->assetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->where('parent_id', $assetId)
            ->whereNull('deleted_at')
            ->exists();
    }

    public function delete(AssetDataIsolation $dataIsolation, AssetEntity $asset): bool
    {
        $builder = $this->assetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->where('id', $asset->getId())
            ->where('user_id', $asset->getUserId());
        $model = $builder->first();
        return $model !== null && $model->delete();
    }

    public function update(AssetDataIsolation $dataIsolation, AssetEntity $asset): ?AssetEntity
    {
        $model = $this->assetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->where('id', $asset->getId())
            ->first();
        if ($model === null) {
            return null;
        }

        $model->fill($asset->toArray());
        $model->save();
        return new AssetEntity($model->toArray());
    }

    /**
     * 按查询范围过滤：
     * - 个人：当前归属人是自己；
     * - 团队分享：别人通过可见范围授权给我/我部门的（本人创建的在「个人」里，不重复出现）；
     * - 公开：官方资产（user_id 为空）；
     * - 全部：个人与团队分享的并集（官方公开仍走 PUBLIC 入口，不混进「全部」）。
     *
     * 授权资产主键由应用层解析后放进查询条件，仓储不直接读权限域的可见性表。
     */
    private function applyScopeFilter(
        Builder $builder,
        AssetDataIsolation $dataIsolation,
        AssetQuery $query,
    ): void {
        $currentUserId = $dataIsolation->getCurrentUserId();
        $sharedAssetIds = $query->getSharedAssetIds();
        switch ($query->getScope()) {
            case AssetScope::PUBLIC:
                // 官方资产以 user_id IS NULL 判定：官方组织里其他人的个人资产不能被带出来。
                $builder->whereNull('user_id');
                return;
            case AssetScope::PERSONAL:
                $builder->where('owner_uid', $currentUserId);
                return;
            case AssetScope::TEAM:
                $builder->where('owner_uid', '!=', $currentUserId)
                    ->whereIn('id', $sharedAssetIds);
                return;
            case AssetScope::ALL:
                $builder->whereIn('id', $query->getAccessibleAssetIds());
                return;
        }
    }
}
