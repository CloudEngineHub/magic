<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity\ValueObject;

enum SlidesTemplateCategoryStatus: int
{
    case Disabled = 0;
    case Enabled = 1;

    public function isEnabled(): bool
    {
        return $this === self::Enabled;
    }
}
