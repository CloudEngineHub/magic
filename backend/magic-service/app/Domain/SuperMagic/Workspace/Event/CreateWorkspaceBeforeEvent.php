<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Workspace\Event;

use App\Domain\SuperMagic\Common\Event\AbstractEvent;

class CreateWorkspaceBeforeEvent extends AbstractEvent
{
    public function __construct(
        private string $organizationCode,
        private string $userId,
        private string $workspaceName,
    ) {
        // Call parent constructor to generate snowflake ID
        parent::__construct();
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getWorkspaceName(): string
    {
        return $this->workspaceName;
    }
}
