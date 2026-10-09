<?php

declare(strict_types=1);

namespace App\Domain\Asset\Entity\ValueObject;

enum AssetVisibilityType: string
{
    case PERSONAL = 'PERSONAL';
    case TEAM = 'TEAM';
}
