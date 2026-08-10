<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Project\Event;

class BeforeCreateMicroAppEvent
{
    public function __construct(
        private readonly string $organizationCode,
        private readonly string $userId,
        private readonly int $currentCount,
        private readonly string $projectName,
    ) {
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getCurrentCount(): int
    {
        return $this->currentCount;
    }

    public function getProjectName(): string
    {
        return $this->projectName;
    }
}
