<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject;

enum MicroAppPublishStatus: string
{
    case Published = 'published';
    case Unpublished = 'unpublished';
}
