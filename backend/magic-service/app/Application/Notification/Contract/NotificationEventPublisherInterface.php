<?php

declare(strict_types=1);

/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Notification\Contract;

interface NotificationEventPublisherInterface
{
    /** @return array{event_id:string,status:string,accepted:bool,duplicate:bool} */
    public function publish(EventEnvelope|array $envelope): array;
}
