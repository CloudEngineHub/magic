<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Repository\Persistence;

use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\ProviderAssetEntity;
use App\Domain\Asset\Repository\Facade\AssetProviderAssetRepositoryInterface;
use App\Domain\Asset\Repository\Persistence\Model\AssetProviderAssetModel;
use App\Infrastructure\Util\IdGenerator\IdGenerator;

class AssetProviderAssetRepository implements AssetProviderAssetRepositoryInterface
{
    public function __construct(protected AssetProviderAssetModel $providerAssetModel)
    {
    }

    public function saveMapping(AssetDataIsolation $dataIsolation, ProviderAssetEntity $providerAsset): AssetProviderAssetModel
    {
        $organizationCode = $dataIsolation->getCurrentOrganizationCode();
        $now = date('Y-m-d H:i:s');
        $providerAsset->setOrganizationCode($organizationCode);
        $values = self::buildMappingPayload($providerAsset, $now);
        // 使用 upsert 原子写入映射，避免并发唯一键冲突。
        $this->providerAssetModel::query()->upsert(
            [$values],
            ['organization_code', 'asset_id', 'provider_code', 'project_name'],
            ['provider_asset_id', 'provider_group_id', 'provider_status', 'provider_failed_reason', 'metadata', 'updated_at', 'deleted_at']
        );
        /** @var AssetProviderAssetModel $model */
        $model = $this->providerAssetModel::query()
            ->where('organization_code', $organizationCode)->where('asset_id', $providerAsset->getAssetId())
            ->where('provider_code', $providerAsset->getProviderCode())->where('project_name', $providerAsset->getProjectName())->firstOrFail();
        return $model;
    }

    /**
     * 生成可审计、带主键和时间戳的 upsert 行。
     */
    public static function buildMappingPayload(ProviderAssetEntity $providerAsset, ?string $now = null): array
    {
        $now ??= date('Y-m-d H:i:s');
        return [
            'id' => IdGenerator::getSnowId(),
            'asset_id' => $providerAsset->getAssetId(),
            'organization_code' => $providerAsset->getOrganizationCode(),
            'provider_code' => $providerAsset->getProviderCode(),
            'provider_asset_id' => $providerAsset->getProviderAssetId(),
            'project_name' => $providerAsset->getProjectName(),
            'provider_group_id' => $providerAsset->getProviderGroupId(),
            'provider_status' => $providerAsset->getProviderStatus()->value,
            'provider_failed_reason' => $providerAsset->getProviderFailedReason(),
            'metadata' => self::encodeMetadata($providerAsset->getMetadata()),
            'created_at' => $now,
            'updated_at' => $now,
            'deleted_at' => null,
        ];
    }

    public function findMapping(AssetDataIsolation $dataIsolation, int|string $assetId, string $providerCode, string $projectName = ''): ?AssetProviderAssetModel
    {
        $organizationCode = $dataIsolation->getCurrentOrganizationCode();
        return $this->providerAssetModel::query()
            ->where('organization_code', $organizationCode)->where('asset_id', $assetId)
            ->where('provider_code', $providerCode)->where('project_name', $projectName)->first();
    }

    public function findMappings(
        AssetDataIsolation $dataIsolation,
        array $assetIds,
        string $providerCode,
        string $projectName = '',
    ): array {
        if ($assetIds === []) {
            return [];
        }
        $models = $this->providerAssetModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->whereIn('asset_id', $assetIds)
            ->where('provider_code', $providerCode)
            ->where('project_name', $projectName)
            ->get();
        $result = [];
        foreach ($models as $model) {
            $entity = new ProviderAssetEntity($model->toArray());
            $result[(string) $entity->getAssetId()] = $entity;
        }
        return $result;
    }

    /**
     * 按状态优先级选择可复用的第三方凭证。
     */
    public function findReusableMappingByAssetIds(array $assetIds, string $providerCode, string $projectName): ?ProviderAssetEntity
    {
        $assetIds = array_values(array_unique(array_filter($assetIds, static fn (mixed $id): bool => (int) $id > 0)));
        if ($assetIds === []) {
            return null;
        }
        $models = $this->providerAssetModel::query()
            ->whereIn('asset_id', $assetIds)
            ->where('provider_code', $providerCode)
            ->where('project_name', $projectName)
            ->where('provider_asset_id', '<>', '')
            ->orderBy('id')
            ->get();

        $pending = null;
        foreach ($models as $model) {
            $mapping = new ProviderAssetEntity($model->toArray());
            if ($mapping->getProviderStatus()->isPassed()) {
                return $mapping;
            }
            if (! $mapping->getProviderStatus()->isProcessing() || $pending !== null) {
                continue;
            }
            $pending = $mapping;
        }
        return $pending;
    }

    public function countOtherReferences(ProviderAssetEntity $mapping): int
    {
        $providerAssetId = trim($mapping->getProviderAssetId());
        $providerGroupId = trim((string) $mapping->getProviderGroupId());
        if ($providerAssetId === '' && $providerGroupId === '') {
            return 0;
        }
        $query = $this->providerAssetModel::query()
            ->where('provider_code', $mapping->getProviderCode())
            ->where('project_name', $mapping->getProjectName())
            ->where('asset_id', '<>', (int) $mapping->getAssetId());
        $query->where(static function ($builder) use ($providerAssetId, $providerGroupId): void {
            if ($providerAssetId !== '') {
                $builder->where('provider_asset_id', $providerAssetId);
            }
            if ($providerGroupId !== '') {
                $builder->orWhere('provider_group_id', $providerGroupId);
            }
        });
        return (int) $query->count();
    }

    public function deleteMapping(
        AssetDataIsolation $dataIsolation,
        int|string $assetId,
        string $providerCode,
        string $projectName,
    ): bool {
        $model = $this->providerAssetModel::query()
            ->where('organization_code', $dataIsolation->getCurrentOrganizationCode())
            ->where('asset_id', $assetId)
            ->where('provider_code', $providerCode)
            ->where('project_name', $projectName)
            ->first();
        if ($model === null) {
            return false;
        }
        return (bool) $model->delete();
    }

    /**
     * 将 metadata 编码为 JSON，供查询构造器写入。
     */
    private static function encodeMetadata(?array $metadata): ?string
    {
        if ($metadata === null || $metadata === []) {
            return null;
        }
        // 编码失败时置空，避免 metadata 阻断凭证写入。
        return json_encode(
            $metadata,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE,
        ) ?: null;
    }
}
