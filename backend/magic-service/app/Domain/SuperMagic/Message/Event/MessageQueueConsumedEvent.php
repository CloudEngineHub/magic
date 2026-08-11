<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Message\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;
use App\Domain\SuperMagic\Message\Entity\MessageQueueEntity;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;

/**
 * Message Queue Consumed Event.
 */
class MessageQueueConsumedEvent extends AbstractEvent
{
    public function __construct(
        private readonly MessageQueueEntity $messageQueueEntity,
        private readonly TopicEntity $topicEntity,
        private readonly bool $success,
    ) {
        parent::__construct();
    }

    public function getMessageQueueEntity(): MessageQueueEntity
    {
        return $this->messageQueueEntity;
    }

    public function getTopicEntity(): TopicEntity
    {
        return $this->topicEntity;
    }

    public function isSuccess(): bool
    {
        return $this->success;
    }
}
