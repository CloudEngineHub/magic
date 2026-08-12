<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\File\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

/**
 * 文件已重命名事件.
 */
class FileRenamedEvent extends AbstractEvent
{
    public function __construct(
        private readonly TaskFileEntity $fileEntity,
        private readonly MagicUserAuthorization $userAuthorization
    ) {
        parent::__construct();
    }

    public function getFileEntity(): TaskFileEntity
    {
        return $this->fileEntity;
    }

    public function getUserAuthorization(): MagicUserAuthorization
    {
        return $this->userAuthorization;
    }
}
