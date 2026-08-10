<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Event;

use App\Domain\SuperMagic\Agent\Entity\SuperMagicAgentEntity;

class SuperMagicAgentDisabledEvent
{
    public function __construct(public SuperMagicAgentEntity $superMagicAgentEntity)
    {
    }
}
