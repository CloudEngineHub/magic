<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Repository\Facade;

use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetTagEntity;

interface AssetTagRepositoryInterface
{
    /** @return AssetTagEntity[] */
    public function queryVisible(AssetDataIsolation $dataIsolation, ?string $ownerUid = null): array;

    /** @return AssetTagEntity[] */
    public function queryVisibleTree(AssetDataIsolation $dataIsolation, ?string $ownerUid = null): array;

    public function findById(AssetDataIsolation $dataIsolation, int|string $id): ?AssetTagEntity;

    public function save(AssetDataIsolation $dataIsolation, AssetTagEntity $entity): AssetTagEntity;

    public function delete(AssetDataIsolation $dataIsolation, int|string $id, ?string $ownerUid = null): bool;

    public function hasChildren(AssetDataIsolation $dataIsolation, int|string $parentId): bool;
}
