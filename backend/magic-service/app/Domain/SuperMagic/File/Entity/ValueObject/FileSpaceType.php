<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\File\Entity\ValueObject;

/**
 * TaskFile 所属空间类型。
 */
enum FileSpaceType: string
{
    case PROJECT = 'project';
    case USER = 'user';
    case TOPIC = 'topic';
}
