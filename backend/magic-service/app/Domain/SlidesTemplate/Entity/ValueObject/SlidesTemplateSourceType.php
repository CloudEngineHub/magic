<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity\ValueObject;

enum SlidesTemplateSourceType: string
{
    case Custom = 'CUSTOM';
    case System = 'SYSTEM';

    public function isSystem(): bool
    {
        return $this === self::System;
    }
}
