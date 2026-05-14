<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum TargetType: string
{
    case Table = MagicBaseConst::TARGET_TABLE;
    case Column = MagicBaseConst::TARGET_COLUMN;
    case Permission = MagicBaseConst::TARGET_PERMISSION;
    case Relation = MagicBaseConst::TARGET_RELATION;
}
