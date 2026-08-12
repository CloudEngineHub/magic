<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Project\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

/**
 * 项目已删除事件.
 */
class ProjectDeletedEvent extends AbstractEvent
{
    public function __construct(
        private readonly ProjectEntity $projectEntity,
        private readonly MagicUserAuthorization $userAuthorization
    ) {
        parent::__construct();
    }

    public function getProjectEntity(): ProjectEntity
    {
        return $this->projectEntity;
    }

    public function getUserAuthorization(): MagicUserAuthorization
    {
        return $this->userAuthorization;
    }
}
