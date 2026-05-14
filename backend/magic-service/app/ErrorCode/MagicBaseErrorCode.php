<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\ErrorCode;

use App\Infrastructure\Core\Exception\Annotation\ErrorMessage;

/**
 * 错误码范围: 47000-47999.
 */
enum MagicBaseErrorCode: int
{
    #[ErrorMessage('magicbase.validate_failed')]
    case ValidateFailed = 47000;

    #[ErrorMessage('magicbase.parameter_missing')]
    case ParameterMissing = 47001;

    #[ErrorMessage('magicbase.resource_not_found')]
    case ResourceNotFound = 47002;

    #[ErrorMessage('magicbase.access_denied')]
    case AccessDenied = 47003;

    #[ErrorMessage('magicbase.unsupported_query')]
    case UnsupportedQuery = 47004;

    #[ErrorMessage('magicbase.storage_unavailable')]
    case StorageUnavailable = 47005;

    #[ErrorMessage('magicbase.relation_invalid')]
    case RelationInvalid = 47006;

    #[ErrorMessage('magicbase.permission_invalid')]
    case PermissionInvalid = 47007;
}
