<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\AppMenu\Entity\ValueObject;

use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;

enum AppMenuSourceType: int
{
    /** 官方菜单 */
    case Official = 1;

    /** 组织自建菜单 */
    case Organization = 2;

    public static function make(mixed $value): self
    {
        if (! is_int($value)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => '菜单来源']);
        }

        $type = self::tryFrom($value);
        if ($type === null) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => '菜单来源']);
        }

        return $type;
    }

    /**
     * @return array<int>
     */
    public static function getValues(): array
    {
        return array_column(self::cases(), 'value');
    }
}
