<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Skill\Event;

use App\Infrastructure\Core\AbstractEvent;

/** Indicates that a market skill file URL was successfully requested. */
class SkillMarketUsedEvent extends AbstractEvent
{
    public function __construct(
        protected string $organizationCode,
        protected string $sourceId,
        protected int $callTime,
        protected string $userId,
        protected string $userName,
        protected string $requestId,
        protected string $skillMarketId,
        protected array $businessParams = [],
    ) {
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getSourceId(): string
    {
        return $this->sourceId;
    }

    public function getCallTime(): int
    {
        return $this->callTime;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getUserName(): string
    {
        return $this->userName;
    }

    public function getRequestId(): string
    {
        return $this->requestId;
    }

    public function getSkillMarketId(): string
    {
        return $this->skillMarketId;
    }

    public function getBusinessParams(): array
    {
        return $this->businessParams;
    }
}
