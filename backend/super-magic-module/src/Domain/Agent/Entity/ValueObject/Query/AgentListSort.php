<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query;

enum AgentListSort: string
{
    case UPDATED_AT = 'updated_at';
    case CREATED_AT = 'created_at';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
