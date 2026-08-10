<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Contract;

interface RequestInterface
{
    public function toArray(): array;
}
