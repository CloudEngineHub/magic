<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\File\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;
use App\Domain\SuperMagic\Common\Event\DeleteEventSource;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;

/**
 * 文件已删除事件.
 */
class FileDeletedEvent extends AbstractEvent
{
    public function __construct(
        private readonly TaskFileEntity $fileEntity,
        private readonly string $userId,
        private readonly string $organizationCode,
        private readonly DeleteEventSource $source = DeleteEventSource::User,
    ) {
        parent::__construct();
    }

    public function getFileEntity(): TaskFileEntity
    {
        return $this->fileEntity;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getSource(): DeleteEventSource
    {
        return $this->source;
    }
}
