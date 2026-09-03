<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Task\Service;

use App\Application\SuperMagic\Common\Service\AbstractAppService;
use App\Domain\SuperMagic\Task\Entity\TaskEntity;
use App\Domain\SuperMagic\Task\Service\TaskDomainService;

class TaskAppService extends AbstractAppService
{
    public function __construct(
        private readonly TaskDomainService $taskDomainService,
    ) {
    }

    public function getTaskById(int $taskId): ?TaskEntity
    {
        return $this->taskDomainService->getTaskById($taskId);
    }
}
