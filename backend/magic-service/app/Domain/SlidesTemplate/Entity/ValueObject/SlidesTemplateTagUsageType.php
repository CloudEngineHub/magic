<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity\ValueObject;

enum SlidesTemplateTagUsageType: string
{
    case Filter = 'filter';
    case Detail = 'detail';
    case Operational = 'operational';
}
