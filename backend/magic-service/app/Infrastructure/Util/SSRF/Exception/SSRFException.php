<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\SSRF\Exception;

use App\Infrastructure\Util\SSRF\SSRFViolation;
use Exception;
use Throwable;

/**
 * SSRF 安全校验异常，携带稳定的拦截类型供上层转换友好提示。
 */
class SSRFException extends Exception
{
    public function __construct(
        string $message = '',
        int $code = 0,
        ?Throwable $previous = null,
        private readonly SSRFViolation $violation = SSRFViolation::Unknown,
    ) {
        parent::__construct($message, $code, $previous);
    }

    /**
     * 获取 SSRF 安全校验失败类型。
     */
    public function getViolation(): SSRFViolation
    {
        return $this->violation;
    }
}
