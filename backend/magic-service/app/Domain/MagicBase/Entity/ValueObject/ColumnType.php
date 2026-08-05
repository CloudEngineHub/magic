<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

enum ColumnType: string
{
    case Text = 'text';
    case Number = 'number';
    case Datetime = 'datetime';
    case Boolean = 'boolean';
    case Json = 'json';
}
