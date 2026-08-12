<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Event;

use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;

class AgentSkillsAddedEvent
{
    /**
     * @param string[] $skillCodes
     */
    public function __construct(
        public readonly SuperMagicAgentDataIsolation $dataIsolation,
        public readonly string $agentCode,
        public readonly array $skillCodes,
        public readonly string $organizationCode
    ) {
    }

    public function getDataIsolation(): SuperMagicAgentDataIsolation
    {
        return $this->dataIsolation;
    }

    public function getAgentCode(): string
    {
        return $this->agentCode;
    }

    /**
     * @return string[]
     */
    public function getSkillCodes(): array
    {
        return $this->skillCodes;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }
}
