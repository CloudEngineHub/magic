<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum SourceType: string
{
    case Manual = MagicBaseConst::SOURCE_MANUAL;
}
