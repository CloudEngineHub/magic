<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\Volcengine;

use RuntimeException;

class VolcengineVisualAsyncClientException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $providerErrorCode = 0,
    ) {
        parent::__construct($message, $providerErrorCode);
    }

    public function getProviderErrorCode(): int
    {
        return $this->providerErrorCode;
    }
}
