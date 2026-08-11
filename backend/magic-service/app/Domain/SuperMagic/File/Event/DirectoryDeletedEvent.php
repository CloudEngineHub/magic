<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\File\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;
use App\Domain\SuperMagic\Common\Event\DeleteEventSource;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

/**
 * 目录已删除事件.
 */
class DirectoryDeletedEvent extends AbstractEvent
{
    public function __construct(
        private readonly TaskFileEntity $directoryEntity,
        private readonly MagicUserAuthorization $userAuthorization,
        private readonly DeleteEventSource $source = DeleteEventSource::User,
    ) {
        parent::__construct();
    }

    public function getDirectoryEntity(): TaskFileEntity
    {
        return $this->directoryEntity;
    }

    public function getUserAuthorization(): MagicUserAuthorization
    {
        return $this->userAuthorization;
    }

    public function getSource(): DeleteEventSource
    {
        return $this->source;
    }
}
