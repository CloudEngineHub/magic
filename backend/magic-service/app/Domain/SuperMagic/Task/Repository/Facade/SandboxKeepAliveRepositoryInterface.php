<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Repository\Facade;

use App\Domain\SuperMagic\Task\Entity\SandboxKeepAliveEntity;

interface SandboxKeepAliveRepositoryInterface
{
    public function findByTopicId(int $topicId): ?SandboxKeepAliveEntity;

    public function getById(int $id): ?SandboxKeepAliveEntity;

    public function create(SandboxKeepAliveEntity $entity): SandboxKeepAliveEntity;

    public function update(SandboxKeepAliveEntity $entity): bool;

    /**
     * @return SandboxKeepAliveEntity[]
     */
    public function findDueEnabled(int $limit, string $thresholdTime): array;

    public function claimForCheck(int $id, string $thresholdTime, string $now): bool;

    public function updateFields(int $id, array $fields): bool;

    public function disableByTopic(int $topicId, ?string $reason = null): bool;

    public function disableByProjectId(int $projectId, ?string $reason = null): int;

    public function disableByProjectIds(array $projectIds, ?string $reason = null): int;
}
