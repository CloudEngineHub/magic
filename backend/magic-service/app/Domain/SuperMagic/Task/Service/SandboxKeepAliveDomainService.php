<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Service;

use App\Domain\SuperMagic\Task\Entity\SandboxKeepAliveEntity;
use App\Domain\SuperMagic\Task\Repository\Facade\SandboxKeepAliveRepositoryInterface;

class SandboxKeepAliveDomainService
{
    public function __construct(
        private readonly SandboxKeepAliveRepositoryInterface $repository
    ) {
    }

    public function registerOrEnable(
        string $userId,
        string $organizationCode,
        int $projectId,
        int $topicId,
        string $sandboxId,
        string $checkedAt
    ): SandboxKeepAliveEntity {
        $entity = $this->repository->findByTopicId($topicId);

        if ($entity === null) {
            $entity = new SandboxKeepAliveEntity();
            $entity->setUserId($userId)
                ->setOrganizationCode($organizationCode)
                ->setProjectId($projectId)
                ->setTopicId($topicId)
                ->setSandboxId($sandboxId)
                ->setIsEnabled(true)
                ->setLastCheckedAt($checkedAt)
                ->setFailureCount(0);

            return $this->repository->create($entity);
        }

        $entity->setUserId($userId)
            ->setOrganizationCode($organizationCode)
            ->setProjectId($projectId)
            ->setSandboxId($sandboxId)
            ->setIsEnabled(true)
            ->setLastCheckedAt($checkedAt)
            ->setFailureCount(0)
            ->setLastError(null);

        $this->repository->update($entity);

        return $entity;
    }

    /**
     * @return SandboxKeepAliveEntity[]
     */
    public function findDueEnabled(int $limit, string $thresholdTime): array
    {
        return $this->repository->findDueEnabled($limit, $thresholdTime);
    }

    public function claimForCheck(int $id, string $thresholdTime, string $now): bool
    {
        return $this->repository->claimForCheck($id, $thresholdTime, $now);
    }

    public function markKeepAliveSuccess(int $id, string $status, string $now): bool
    {
        return $this->repository->updateFields($id, [
            'last_keepalive_at' => $now,
            'last_status' => $status,
            'failure_count' => 0,
            'last_error' => null,
        ]);
    }

    public function markRestarted(int $id, string $sandboxId, string $status, string $now): bool
    {
        return $this->repository->updateFields($id, [
            'sandbox_id' => $sandboxId,
            'last_restarted_at' => $now,
            'last_status' => $status,
            'failure_count' => 0,
            'last_error' => null,
        ]);
    }

    public function markStatus(int $id, string $status): bool
    {
        return $this->repository->updateFields($id, [
            'last_status' => $status,
        ]);
    }

    public function markFailure(int $id, string $status, string $error): bool
    {
        return $this->repository->updateFields($id, [
            'last_status' => $status,
            'last_error' => mb_substr($error, 0, 500),
            'failure_count' => $this->incrementFailureCount($id),
        ]);
    }

    public function disableByTopic(int $topicId, ?string $reason = null): bool
    {
        return $this->repository->disableByTopic($topicId, $reason);
    }

    public function disableByProjectId(int $projectId, ?string $reason = null): int
    {
        return $this->repository->disableByProjectId($projectId, $reason);
    }

    public function disableByProjectIds(array $projectIds, ?string $reason = null): int
    {
        return $this->repository->disableByProjectIds($projectIds, $reason);
    }

    private function incrementFailureCount(int $id): int
    {
        $entity = $this->repository->getById($id);
        return $entity === null ? 1 : $entity->getFailureCount() + 1;
    }
}
