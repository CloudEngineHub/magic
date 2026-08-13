<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Repository\Facade;

use App\Domain\SuperMagic\Agent\Entity\AgentCategoryEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\Query\AgentCategoryQuery;

/**
 * Agent 分类仓储接口.
 */
interface AgentCategoryRepositoryInterface
{
    public function findById(int $id): ?AgentCategoryEntity;

    /** @return AgentCategoryEntity[] */
    public function findByIds(array $ids): array;

    /** @return AgentCategoryEntity[] */
    public function findByQuery(AgentCategoryQuery $query): array;

    /** @return AgentCategoryEntity[] */
    public function findEnabled(): array;

    public function save(AgentCategoryEntity $entity): AgentCategoryEntity;

    public function deleteById(int $id): bool;

    /** @return AgentCategoryEntity[] */
    public function findAll(): array;
}
