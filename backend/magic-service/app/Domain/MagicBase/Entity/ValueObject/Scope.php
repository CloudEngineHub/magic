<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum Scope: string
{
    case Public = MagicBaseConst::SCOPE_PUBLIC;
    case PrivateUser = MagicBaseConst::SCOPE_PRIVATE_USER;
    case PrivateDepartment = MagicBaseConst::SCOPE_PRIVATE_DEPARTMENT;
    case PrivateOrg = MagicBaseConst::SCOPE_PRIVATE_ORG;
    case Disabled = MagicBaseConst::SCOPE_DISABLED;
}
