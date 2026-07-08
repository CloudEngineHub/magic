<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\Agent\DTO;

use Dtyq\SuperMagic\Domain\Agent\Entity\AgentVersionEntity;

final readonly class PublishAgentResultDTO
{
    public function __construct(
        public AgentVersionEntity $version,
        public ?string $sandboxId,
    ) {
    }
}
