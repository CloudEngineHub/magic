<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\File\Service;

use App\Domain\SuperMagic\Task\Entity\TaskEntity;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;

final class FileDeletionPolicyContext
{
    /** @param array<int, TaskEntity> $tasks */
    /** @param array<int, TopicEntity> $topics */
    public function __construct(
        public readonly array $tasks = [],
        public readonly array $topics = [],
    ) {
    }

    public function task(int $id): ?TaskEntity
    {
        return $this->tasks[$id] ?? null;
    }

    public function topic(int $id): ?TopicEntity
    {
        return $this->topics[$id] ?? null;
    }
}
