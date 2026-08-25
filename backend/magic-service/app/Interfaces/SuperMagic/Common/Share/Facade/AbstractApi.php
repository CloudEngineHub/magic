<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Common\Share\Facade;

use App\Infrastructure\Core\Traits\MagicUserAuthorizationTrait;

abstract class AbstractApi
{
    use MagicUserAuthorizationTrait;
}
