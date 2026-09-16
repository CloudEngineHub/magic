<?php

declare(strict_types=1);

namespace App\Domain\Asset\Repository\Facade;

use App\Domain\Asset\Entity\AssetDataIsolation;

interface AssetTagRelationRepositoryInterface
{
    /** @param int[] $tagIds */
    public function syncAssetTags(AssetDataIsolation $dataIsolation, int|string $assetId, array $tagIds, string $createdUid): void;

    public function deleteByAssetId(AssetDataIsolation $dataIsolation, int|string $assetId): void;

    public function deleteByTagId(AssetDataIsolation $dataIsolation, int|string $tagId): void;

    /** @return int[] */
    public function findTagIdsByAssetId(AssetDataIsolation $dataIsolation, int|string $assetId): array;

    /** @return int[] */
    public function findAssetIdsByTagId(AssetDataIsolation $dataIsolation, int|string $tagId): array;
}
