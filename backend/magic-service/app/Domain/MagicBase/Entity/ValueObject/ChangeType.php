<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum ChangeType: string
{
    case Create = MagicBaseConst::CHANGE_CREATE;
    case Update = MagicBaseConst::CHANGE_UPDATE;
    case Delete = MagicBaseConst::CHANGE_DELETE;
}
