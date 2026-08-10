<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Entity\ValueObject;

/**
 * 市场记录的显式可见范围类型，不由组织编码推断。
 */
enum AgentMarketType: string
{
    case MARKET = 'MARKET';
    case ORGANIZATION = 'ORGANIZATION';
}
