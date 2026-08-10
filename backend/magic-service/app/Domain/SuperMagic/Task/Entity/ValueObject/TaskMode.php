<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Entity\ValueObject;

enum TaskMode: string
{
    case Chat = 'chat';
    case Plan = 'plan';
}
