<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Project\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;

/**
 * Project hidden status updated event.
 */
class ProjectHiddenStatusUpdatedEvent extends AbstractEvent
{
    public function __construct(
        private readonly int $projectId,
        private readonly string $userId,
        private readonly string $userOrganizationCode,
        private readonly ?string $projectMode,
        private readonly bool $isHidden
    ) {
        parent::__construct();
    }

    public function getProjectId(): int
    {
        return $this->projectId;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getUserOrganizationCode(): string
    {
        return $this->userOrganizationCode;
    }

    public function getProjectMode(): ?string
    {
        return $this->projectMode;
    }

    public function isHidden(): bool
    {
        return $this->isHidden;
    }
}
