<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageExpand\Exception;

use RuntimeException;

class ImageExpandDriverException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly ?int $providerErrorCode = null,
        private readonly ?string $provider = null,
    ) {
        parent::__construct($message, $providerErrorCode ?? 0);
    }

    public function getProviderErrorCode(): ?int
    {
        return $this->providerErrorCode;
    }

    public function getProvider(): ?string
    {
        return $this->provider;
    }
}
