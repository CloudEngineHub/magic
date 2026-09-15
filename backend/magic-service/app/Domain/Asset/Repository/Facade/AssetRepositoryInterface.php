<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Repository\Facade;

use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\ValueObject\Query\AssetQuery;
use App\Infrastructure\Core\ValueObject\Page;

interface AssetRepositoryInterface
{
    public function save(AssetDataIsolation $dataIsolation, AssetEntity $asset): AssetEntity;

    /**
     * 按组织隔离、查询范围、用户和资产类型分页，排序固定为 created_at/id 倒序。
     *
     * 仓储只负责组织隔离与范围过滤（个人 / 团队分享 / 官方公开 / 全部）；
     * 「团队分享」用到的资产主键由应用层从 magic_resource_visibility 解析后放进
     * {@see AssetQuery::setSharedAssetIds()}，仓储不跨领域读权限表。
     */
    public function queries(
        AssetDataIsolation $dataIsolation,
        AssetQuery $query,
        Page $page,
    ): array;

    public function findById(AssetDataIsolation $dataIsolation, int|string $id): ?AssetEntity;

    /**
     * 按内容指纹查存活素材主键，用于复用第三方素材。
     *
     * 第三方素材是全局资源：同一份内容各组织各建一条本地记录、共用同一个 provider_asset_id，
     * 因此这里刻意不按 organization_code 过滤——这正是「同一张图片只上传一次」能生效的前提。
     *
     * @return int[]
     */
    public function findIdsByContentHash(string $contentHash, int $limit = 20): array;

    /**
     * 查当前用户自己已同步的个人资产，用于视频生成的素材去重复用。
     *
     * 与 findIdsByContentHash 不同：这里按 user_id 过滤且只取 SYNCED 的素材，
     * 保证复用到的都是本人已确认可用的私有资产。
     */
    public function findPersonalAssetByContentHash(string $userId, string $contentHash): ?AssetEntity;

    /**
     * 是否还有未删除的直接子级（素材或子组）；它是删除素材组前的硬性检查。
     */
    public function hasChildren(AssetDataIsolation $dataIsolation, int|string $assetId): bool;

    /**
     * 软删除资产，返回是否命中记录。
     */
    public function delete(AssetDataIsolation $dataIsolation, AssetEntity $asset): bool;

    public function update(AssetDataIsolation $dataIsolation, AssetEntity $asset): ?AssetEntity;
}
