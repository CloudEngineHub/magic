<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject;

enum AgentCategoryRelationType: string
{
    case AgentVersion = 'AGENT_VERSION';
    case AgentMarket = 'AGENT_MARKET';
}
