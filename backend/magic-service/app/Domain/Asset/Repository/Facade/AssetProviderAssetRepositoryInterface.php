<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Repository\Facade;

use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\ProviderAssetEntity;
use App\Domain\Asset\Repository\Persistence\Model\AssetProviderAssetModel;

interface AssetProviderAssetRepositoryInterface
{
    /**
     * Provider 映射按 asset_id + provider 幂等保存。
     */
    public function saveMapping(AssetDataIsolation $dataIsolation, ProviderAssetEntity $providerAsset): AssetProviderAssetModel;

    public function findMapping(AssetDataIsolation $dataIsolation, int|string $assetId, string $providerCode, string $projectName = ''): ?AssetProviderAssetModel;

    /**
     * @param array<int, int|string> $assetIds
     * @return array<string, ProviderAssetEntity>
     */
    public function findMappings(
        AssetDataIsolation $dataIsolation,
        array $assetIds,
        string $providerCode,
        string $projectName = '',
    ): array;

    /**
     * 在这些本地素材的映射里找一条可复用的第三方凭证（同一份内容要不要重复上传的判据）。
     *
     * 优先返回已 PASS 的凭证（合规结论可直接复用）；只有审核中的凭证时才退而取之
     * （同一张图并发上传时，后者应当跟着前者一起等审核，而不是再传一份）；
     * 已 FAILED 的凭证不返回——那条内容在第三方永远走不到可用状态。
     *
     * @param int[] $assetIds 内容指纹相同的本地素材主键
     */
    public function findReusableMappingByAssetIds(array $assetIds, string $providerCode, string $projectName): ?ProviderAssetEntity;

    /**
     * 统计同一第三方素材/素材组还被多少条其他映射引用。
     *
     * 跨组织统计：第三方资源是全局的，别的组织复用同一条凭证时同样不能回收。
     * 不含自己那一行，调用方应传入已被软删素材的映射（本地行已删，因此它不算引用方）。
     */
    public function countOtherReferences(ProviderAssetEntity $mapping): int;

    /**
     * 软删除一条映射；第三方资源确认回收后调用，保留行便于审计。
     */
    public function deleteMapping(
        AssetDataIsolation $dataIsolation,
        int|string $assetId,
        string $providerCode,
        string $projectName,
    ): bool;
}
