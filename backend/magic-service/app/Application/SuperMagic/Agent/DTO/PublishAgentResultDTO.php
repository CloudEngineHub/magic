<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\DTO;

use App\Domain\SuperMagic\Agent\Entity\AgentVersionEntity;

final readonly class PublishAgentResultDTO
{
    public function __construct(
        public AgentVersionEntity $version,
        public ?string $sandboxId,
    ) {
    }
}
