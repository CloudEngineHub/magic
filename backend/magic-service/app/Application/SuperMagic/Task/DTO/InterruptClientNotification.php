<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Task\DTO;

/**
 * Describes a pending interrupt notification that should be pushed to the client.
 * Returned by HandleUserMessageAppService::handleInternalMessage so that the caller
 * (e.g. SuperAgentMessageSubscriberV2) owns the actual WebSocket delivery and the
 * core service stays decoupled from client messaging.
 */
final class InterruptClientNotification
{
    public function __construct(
        public readonly int $topicId,
        public readonly string $taskId,
        public readonly string $reason,
    ) {
    }
}
