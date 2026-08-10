<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\File\Event;

class AttachmentsProcessedEvent
{
    public function __construct(
        public int $parentFileId,
        public int $projectId,
        public int $taskId = 0
    ) {
    }
}
