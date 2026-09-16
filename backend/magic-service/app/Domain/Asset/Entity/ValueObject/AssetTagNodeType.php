<?php

declare(strict_types=1);

namespace App\Domain\Asset\Entity\ValueObject;

enum AssetTagNodeType: string
{
    case Group = 'group';
    case Tag = 'tag';
}
