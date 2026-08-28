<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Event;

use App\Application\SuperMagic\Message\DTO\TaskInitializationMessageDTO;

/**
 * Task initialization event.
 */
class TaskInitializationEvent
{
    public function __construct(
        public readonly TaskInitializationMessageDTO $message
    ) {
    }
}
