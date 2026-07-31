<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\SSRF;

/**
 * SSRF 安全校验失败类型。
 */
enum SSRFViolation: string
{
    case InvalidUrl = 'invalid_url';
    case Blacklisted = 'blacklisted';
    case ProtocolNotAllowed = 'protocol_not_allowed';
    case NonPublicIp = 'non_public_ip';
    case RedirectNotAllowed = 'redirect_not_allowed';
    case ResolveFailed = 'resolve_failed';
    case Unknown = 'unknown';
}
