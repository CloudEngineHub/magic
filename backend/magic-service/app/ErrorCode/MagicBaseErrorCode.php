<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\ErrorCode;

use App\Infrastructure\Core\Exception\Annotation\ErrorMessage;

/**
 * 错误码范围: 48000-48999.
 */
enum MagicBaseErrorCode: int
{
    #[ErrorMessage('magicbase.validate_failed')]
    case ValidateFailed = 48000;

    #[ErrorMessage('magicbase.parameter_missing')]
    case ParameterMissing = 48001;

    #[ErrorMessage('magicbase.resource_not_found')]
    case ResourceNotFound = 48002;

    #[ErrorMessage('magicbase.access_denied')]
    case AccessDenied = 48003;

    #[ErrorMessage('magicbase.unsupported_query')]
    case UnsupportedQuery = 48004;

    #[ErrorMessage('magicbase.storage_unavailable')]
    case StorageUnavailable = 48005;

    #[ErrorMessage('magicbase.relation_invalid')]
    case RelationInvalid = 48006;

    #[ErrorMessage('magicbase.permission_invalid')]
    case PermissionInvalid = 48007;
}
