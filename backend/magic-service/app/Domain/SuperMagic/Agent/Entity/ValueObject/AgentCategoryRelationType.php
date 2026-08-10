<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Entity\ValueObject;

enum AgentCategoryRelationType: string
{
    case AgentVersion = 'AGENT_VERSION';
    case AgentMarket = 'AGENT_MARKET';
}
