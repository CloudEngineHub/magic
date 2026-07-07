<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Audit\Repository;

use App\Domain\Audit\ResourceAccess\Entity\ResourceAccessLogEntity;
use App\Domain\Audit\ResourceAccess\Repository\Facade\ResourceAccessLogRepositoryInterface;
use App\Infrastructure\Audit\Repository\Model\ResourceAccessLogModel;

use function Hyperf\Support\now;

class ResourceAccessLogRepository implements ResourceAccessLogRepositoryInterface
{
    public function save(ResourceAccessLogEntity $entity): ResourceAccessLogEntity
    {
        $model = ResourceAccessLogModel::create([
            'organization_code' => $entity->getOrganizationCode(),
            'user_id' => $entity->getUserId(),
            'user_name' => $entity->getUserName(),
            'actor_type' => $entity->getActorType(),
            'resource_type' => $entity->getResourceType(),
            'resource_code' => $entity->getResourceCode(),
            'resource_name' => $entity->getResourceName(),
            'resource_owner_organization_code' => $entity->getResourceOwnerOrganizationCode(),
            'operation' => $entity->getOperation(),
            'source' => $entity->getSource(),
            'source_detail' => $entity->getSourceDetail(),
            'status' => $entity->getStatus(),
            'ip' => $entity->getIp(),
            'user_agent' => $entity->getUserAgent(),
            'request_url' => $entity->getRequestUrl(),
            'request_id' => $entity->getRequestId(),
            'trace_id' => $entity->getTraceId(),
            'context' => $entity->getContext(),
            'resource_snapshot' => $entity->getResourceSnapshot(),
            'created_at' => $entity->getCreatedAt() ?? now(),
            'updated_at' => $entity->getUpdatedAt() ?? now(),
        ]);

        $entity->setId($model->id);
        return $entity;
    }
}
