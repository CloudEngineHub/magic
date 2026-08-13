<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Exception;

use App\ErrorCode\MagicBaseErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;

final class MagicBaseExceptionBuilder
{
    public static function parameterMissing(string $label): void
    {
        ExceptionBuilder::throw(MagicBaseErrorCode::ParameterMissing, 'common.empty', ['label' => $label]);
    }

    public static function validateFailed(string $label): void
    {
        ExceptionBuilder::throw(MagicBaseErrorCode::ValidateFailed, 'common.invalid', ['label' => $label]);
    }

    public static function resourceNotFound(string $label): void
    {
        ExceptionBuilder::throw(MagicBaseErrorCode::ResourceNotFound, 'common.not_found', ['label' => $label]);
    }

    public static function accessDenied(string $message): void
    {
        ExceptionBuilder::throw(MagicBaseErrorCode::AccessDenied, 'magicbase.access_denied', ['message' => $message]);
    }

    public static function storageUnavailable(string $message): void
    {
        ExceptionBuilder::throw(MagicBaseErrorCode::StorageUnavailable, 'magicbase.storage_unavailable', ['message' => $message]);
    }

    public static function relationInvalid(string $label): void
    {
        ExceptionBuilder::throw(MagicBaseErrorCode::RelationInvalid, 'common.invalid', ['label' => $label]);
    }

    public static function permissionInvalid(string $label): void
    {
        ExceptionBuilder::throw(MagicBaseErrorCode::PermissionInvalid, 'common.invalid', ['label' => $label]);
    }
}
