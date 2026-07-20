<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ResourceAccess\Service;

use App\Domain\Audit\ResourceAccess\Entity\ResourceAccessLogEntity;
use App\Domain\Audit\ResourceAccess\Repository\Facade\ResourceAccessLogRepositoryInterface;

readonly class ResourceAccessLogDomainService
{
    public function __construct(
        private ResourceAccessLogRepositoryInterface $repository
    ) {
    }

    public function save(ResourceAccessLogEntity $entity): ResourceAccessLogEntity
    {
        $entity->prepareForCreation();
        return $this->repository->save($entity);
    }
}
