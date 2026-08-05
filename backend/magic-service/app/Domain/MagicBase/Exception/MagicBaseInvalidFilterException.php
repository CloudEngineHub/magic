<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Exception;

use App\ErrorCode\MagicBaseErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;

class MagicBaseInvalidFilterException extends BusinessException
{
    /**
     * @param array<string, mixed> $data
     */
    public function __construct(string $message, array $data = [])
    {
        parent::__construct($message, MagicBaseErrorCode::ValidateFailed->value);
        $this->setData($data);
    }
}
