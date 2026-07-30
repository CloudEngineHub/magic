<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject;

/**
 * 当前用户视角下，员工在列表中的展示来源。
 */
enum AgentOrigin: string
{
    case OFFICIAL = 'OFFICIAL';
    case CREATED = 'CREATED';
    case MARKET = 'MARKET';
    case TEAM_SHARED = 'TEAM_SHARED';
}
