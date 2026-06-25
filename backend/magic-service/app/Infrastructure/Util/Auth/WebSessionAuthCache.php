<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\Auth;

use App\Interfaces\Authorization\Web\MagicUserAuthorization;

class WebSessionAuthCache
{
    private const string AUTH_USER_PREFIX = 'auth_user:';

    public static function authUserKey(string $authorization, string $organizationCode = '', string $apiKey = ''): string
    {
        return self::AUTH_USER_PREFIX . md5($authorization . $organizationCode . $apiKey . MagicUserAuthorization::class);
    }
}
