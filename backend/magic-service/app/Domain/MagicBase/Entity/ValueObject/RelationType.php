<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum RelationType: string
{
    case BelongsTo = MagicBaseConst::RELATION_BELONGS_TO;
    case HasOne = MagicBaseConst::RELATION_HAS_ONE;
    case HasMany = MagicBaseConst::RELATION_HAS_MANY;
}
