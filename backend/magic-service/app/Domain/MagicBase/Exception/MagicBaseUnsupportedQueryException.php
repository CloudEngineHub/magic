<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Exception;

use App\ErrorCode\MagicBaseErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;

class MagicBaseUnsupportedQueryException extends BusinessException
{
    /**
     * @param array{field: string, reason: string, suggestion: string} $data
     */
    public function __construct(string $message, private readonly array $data)
    {
        parent::__construct($message, MagicBaseErrorCode::UnsupportedQuery->value);
    }

    /**
     * @return array{field: string, reason: string, suggestion: string}
     */
    public function getData(): array
    {
        return $this->data;
    }
}
