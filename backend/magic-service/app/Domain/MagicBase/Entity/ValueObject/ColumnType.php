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
    case SingleSelect = 'single_select';
    case MultiSelect = 'multi_select';
    case User = 'user';
    case Department = 'department';
    case Attachment = 'attachment';
    case Json = 'json';
    case Reference = 'reference';
}
