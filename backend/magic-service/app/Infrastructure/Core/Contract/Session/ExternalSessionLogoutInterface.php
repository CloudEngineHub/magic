<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Core\Contract\Session;

interface ExternalSessionLogoutInterface
{
    public function logout(ExternalSessionLogoutContext $context): ExternalSessionLogoutResult;
}
