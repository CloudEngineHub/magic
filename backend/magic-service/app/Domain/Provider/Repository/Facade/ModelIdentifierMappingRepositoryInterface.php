<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Provider\Repository\Facade;

use App\Domain\Provider\Entity\ModelIdentifierMappingEntity;
use App\Domain\Provider\Entity\ValueObject\ProviderDataIsolation;
use App\Domain\Provider\Entity\ValueObject\Query\ModelIdentifierMappingQuery;
use App\Infrastructure\Core\ValueObject\Page;

interface ModelIdentifierMappingRepositoryInterface
{
    /**
     * @return array{total: int, list: array<int, array<string, mixed>>}
     */
    public function queryGroups(ProviderDataIsolation $dataIsolation, ModelIdentifierMappingQuery $query, Page $page): array;

    /**
     * @return ModelIdentifierMappingEntity[]
     */
    public function getByGroupId(ProviderDataIsolation $dataIsolation, string $groupId): array;

    /**
     * @param string[] $groupIds
     * @return array<string, ModelIdentifierMappingEntity[]>
     */
    public function getByGroupIds(ProviderDataIsolation $dataIsolation, array $groupIds): array;

    /**
     * @param string[] $sourceModelIds
     * @return string[]
     */
    public function findConflictingSourceModelIds(ProviderDataIsolation $dataIsolation, array $sourceModelIds, ?string $excludeGroupId = null): array;

    /**
     * @return array<string, string>
     */
    public function getActiveMappingMap(ProviderDataIsolation $dataIsolation): array;

    /**
     * @return array<int, array<string, mixed>>
     */
    public function querySourceOptions(ProviderDataIsolation $dataIsolation, string $keyword, int $limit = 50): array;

    /**
     * @return array<int, array<string, mixed>>
     */
    public function queryTargetOptions(ProviderDataIsolation $dataIsolation, string $keyword, int $limit = 50): array;

    /**
     * 保存一个按源模型标识拆分的映射组。
     */
    public function saveGroup(ProviderDataIsolation $dataIsolation, string $groupId, string $groupName, string $targetModelId, array $sourceModelIds): array;

    /**
     * 更新单组状态。
     */
    public function updateGroupStatus(ProviderDataIsolation $dataIsolation, string $groupId, int $status): void;

    /**
     * @param string[] $groupIds
     */
    public function updateGroupsStatus(ProviderDataIsolation $dataIsolation, array $groupIds, int $status): void;

    /**
     * 删除单组有效记录。
     */
    public function deleteGroup(ProviderDataIsolation $dataIsolation, string $groupId): void;

    /**
     * @param string[] $groupIds
     */
    public function deleteGroups(ProviderDataIsolation $dataIsolation, array $groupIds): void;
}
