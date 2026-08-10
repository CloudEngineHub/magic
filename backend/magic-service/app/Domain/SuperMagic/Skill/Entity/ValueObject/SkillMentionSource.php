<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Skill\Entity\ValueObject;

/**
 * 聊天 @ 技能候选来源枚举.
 */
enum SkillMentionSource: string
{
    case SYSTEM = 'system';
    case AGENT = 'agent';
    case MINE = 'mine';
}
