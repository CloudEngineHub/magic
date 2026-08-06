<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Repository\Persistence;

use App\Domain\SuperMagic\Task\Entity\SandboxKeepAliveEntity;
use App\Domain\SuperMagic\Task\Repository\Facade\SandboxKeepAliveRepositoryInterface;
use App\Domain\SuperMagic\Task\Repository\Model\SandboxKeepAliveModel;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Carbon\Carbon;

class SandboxKeepAliveRepository implements SandboxKeepAliveRepositoryInterface
{
    public function __construct(private readonly SandboxKeepAliveModel $model)
    {
    }

    public function findByTopicId(int $topicId): ?SandboxKeepAliveEntity
    {
        $model = $this->model::query()
            ->where('topic_id', $topicId)
            ->whereNull('deleted_at')
            ->first();

        return $model ? $this->convertToEntity($model) : null;
    }

    public function getById(int $id): ?SandboxKeepAliveEntity
    {
        $model = $this->model::query()
            ->where('id', $id)
            ->whereNull('deleted_at')
            ->first();

        return $model ? $this->convertToEntity($model) : null;
    }

    public function create(SandboxKeepAliveEntity $entity): SandboxKeepAliveEntity
    {
        if ($entity->getId() === 0) {
            $entity->setId(IdGenerator::getSnowId());
        }

        $now = date('Y-m-d H:i:s');
        if ($entity->getCreatedAt() === null) {
            $entity->setCreatedAt($now);
        }
        if ($entity->getUpdatedAt() === null) {
            $entity->setUpdatedAt($now);
        }

        $model = $this->model::query()->create($this->convertEntityToModelData($entity));
        return $this->convertToEntity($model);
    }

    public function update(SandboxKeepAliveEntity $entity): bool
    {
        $data = $this->convertEntityToModelData($entity);
        unset($data['id'], $data['created_at']);
        $data['updated_at'] = date('Y-m-d H:i:s');

        return $this->model::query()
            ->where('id', $entity->getId())
            ->whereNull('deleted_at')
            ->update($data) > 0;
    }

    public function findDueEnabled(int $limit, string $thresholdTime): array
    {
        $models = $this->model::query()
            ->where('is_enabled', 1)
            ->whereNull('deleted_at')
            ->where(function ($query) use ($thresholdTime) {
                $query->whereNull('last_checked_at')
                    ->orWhere('last_checked_at', '<=', $thresholdTime);
            })
            ->orderBy('last_checked_at', 'asc')
            ->orderBy('id', 'asc')
            ->limit($limit)
            ->get();

        $entities = [];
        foreach ($models as $model) {
            $entities[] = $this->convertToEntity($model);
        }

        return $entities;
    }

    public function claimForCheck(int $id, string $thresholdTime, string $now): bool
    {
        return $this->model::query()
            ->where('id', $id)
            ->where('is_enabled', 1)
            ->whereNull('deleted_at')
            ->where(function ($query) use ($thresholdTime) {
                $query->whereNull('last_checked_at')
                    ->orWhere('last_checked_at', '<=', $thresholdTime);
            })
            ->update([
                'last_checked_at' => $now,
                'updated_at' => $now,
            ]) > 0;
    }

    public function updateFields(int $id, array $fields): bool
    {
        $fields['updated_at'] = date('Y-m-d H:i:s');

        return $this->model::query()
            ->where('id', $id)
            ->whereNull('deleted_at')
            ->update($fields) > 0;
    }

    public function disableByTopic(int $topicId, ?string $reason = null): bool
    {
        return $this->model::query()
            ->where('topic_id', $topicId)
            ->whereNull('deleted_at')
            ->update([
                'is_enabled' => 0,
                'last_error' => $reason,
                'updated_at' => date('Y-m-d H:i:s'),
            ]) > 0;
    }

    public function disableByProjectId(int $projectId, ?string $reason = null): int
    {
        return $this->model::query()
            ->where('project_id', $projectId)
            ->whereNull('deleted_at')
            ->update([
                'is_enabled' => 0,
                'last_error' => $reason,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
    }

    public function disableByProjectIds(array $projectIds, ?string $reason = null): int
    {
        $projectIds = array_values(array_unique(array_filter(array_map('intval', $projectIds))));
        if ($projectIds === []) {
            return 0;
        }

        return $this->model::query()
            ->whereIn('project_id', $projectIds)
            ->whereNull('deleted_at')
            ->update([
                'is_enabled' => 0,
                'last_error' => $reason,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
    }

    private function convertToEntity($model): SandboxKeepAliveEntity
    {
        $data = [];
        foreach ($model->toArray() as $key => $value) {
            $data[$this->snakeToCamel($key)] = $this->normalizeValue($value);
        }

        return new SandboxKeepAliveEntity($data);
    }

    private function convertEntityToModelData(SandboxKeepAliveEntity $entity): array
    {
        return [
            'id' => $entity->getId(),
            'user_id' => $entity->getUserId(),
            'organization_code' => $entity->getOrganizationCode(),
            'project_id' => $entity->getProjectId(),
            'topic_id' => $entity->getTopicId(),
            'sandbox_id' => $entity->getSandboxId(),
            'is_enabled' => $entity->getIsEnabled(),
            'last_checked_at' => $entity->getLastCheckedAt(),
            'last_keepalive_at' => $entity->getLastKeepaliveAt(),
            'last_restarted_at' => $entity->getLastRestartedAt(),
            'last_status' => $entity->getLastStatus(),
            'failure_count' => $entity->getFailureCount(),
            'last_error' => $entity->getLastError(),
            'deleted_at' => $entity->getDeletedAt(),
            'created_at' => $entity->getCreatedAt(),
            'updated_at' => $entity->getUpdatedAt(),
        ];
    }

    private function normalizeValue(mixed $value): mixed
    {
        if ($value instanceof Carbon) {
            return $value->toDateTimeString();
        }

        return $value;
    }

    private function snakeToCamel(string $snake): string
    {
        return lcfirst(str_replace(' ', '', ucwords(str_replace(['_', '-'], ' ', $snake))));
    }
}
