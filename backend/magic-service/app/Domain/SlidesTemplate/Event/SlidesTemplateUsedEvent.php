<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Event;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Infrastructure\Core\AbstractEvent;

class SlidesTemplateUsedEvent extends AbstractEvent
{
    public function __construct(
        protected string $userId,
        protected string $organizationCode,
        protected string $userName,
        protected SlidesTemplateEntity $template,
        protected array $accessContext = []
    ) {
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getUserName(): string
    {
        return $this->userName;
    }

    public function getTemplate(): SlidesTemplateEntity
    {
        return $this->template;
    }

    public function getAccessContext(): array
    {
        return $this->accessContext;
    }
}
