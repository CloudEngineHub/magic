<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class ActorContext
{
    /**
     * @param list<string> $departmentIds
     */
    public function __construct(
        private string $userId,
        private string $organizationCode,
        private array $departmentIds = [],
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

    /**
     * @return list<string>
     */
    public function getDepartmentIds(): array
    {
        return $this->departmentIds;
    }
}
