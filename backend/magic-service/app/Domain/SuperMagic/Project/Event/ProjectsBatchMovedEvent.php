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
 * Projects batch moved event.
 */
class ProjectsBatchMovedEvent extends AbstractEvent
{
    /**
     * @param ProjectEntity[] $projectEntities
     */
    public function __construct(
        private readonly array $projectEntities,
        private readonly MagicUserAuthorization $userAuthorization
    ) {
        parent::__construct();
    }

    /**
     * @return ProjectEntity[]
     */
    public function getProjectEntities(): array
    {
        return $this->projectEntities;
    }

    public function getUserAuthorization(): MagicUserAuthorization
    {
        return $this->userAuthorization;
    }
}
