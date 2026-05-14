<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum PermissionLevel: string
{
    case Read = MagicBaseConst::PERMISSION_READ;
    case Insert = MagicBaseConst::PERMISSION_INSERT;
    case Manage = MagicBaseConst::PERMISSION_MANAGE;
}
