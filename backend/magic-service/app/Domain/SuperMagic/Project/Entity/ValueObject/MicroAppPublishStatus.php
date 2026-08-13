<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Project\Entity\ValueObject;

enum MicroAppPublishStatus: string
{
    case Published = 'published';
    case Unpublished = 'unpublished';
}
