<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Topic\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

/**
 * 话题已创建事件.
 */
class TopicCreatedEvent extends AbstractEvent
{
    public function __construct(
        private readonly TopicEntity $topicEntity,
        private readonly MagicUserAuthorization $userAuthorization
    ) {
        parent::__construct();
    }

    public function getTopicEntity(): TopicEntity
    {
        return $this->topicEntity;
    }

    public function getUserAuthorization(): MagicUserAuthorization
    {
        return $this->userAuthorization;
    }
}
