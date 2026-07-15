<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity\ValueObject;

enum SlidesTemplateTagStatus: int
{
    case Disabled = 0;
    case Enabled = 1;
}
