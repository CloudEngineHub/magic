<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Authentication\Service;

use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutContext;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutInterface;
use App\Infrastructure\Core\Contract\Session\ExternalSessionLogoutResult;

class NoopExternalSessionLogoutService implements ExternalSessionLogoutInterface
{
    public function logout(ExternalSessionLogoutContext $context): ExternalSessionLogoutResult
    {
        return ExternalSessionLogoutResult::skipped('external_session_logout_not_configured');
    }
}
