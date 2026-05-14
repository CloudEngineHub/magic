<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum SubjectType: string
{
    case Organization = MagicBaseConst::SUBJECT_ORGANIZATION;
    case OrganizationCode = MagicBaseConst::SUBJECT_ORGANIZATION_CODE;
    case Department = MagicBaseConst::SUBJECT_DEPARTMENT;
    case User = MagicBaseConst::SUBJECT_USER;
    case Anonymous = MagicBaseConst::SUBJECT_ANONYMOUS;
}
