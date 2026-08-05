<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use RuntimeException;
use Throwable;

final class ProviderVideoException extends RuntimeException
{
    private const array RETRIABLE_HTTP_STATUSES = [408, 425, 429];

    private function __construct(
        string $message,
        private readonly bool $retriable,
        private readonly ?int $httpStatus = null,
        ?Throwable $previous = null,
    )
    {
        parent::__construct($message, 0, $previous);
    }

    public static function retriable(string $message, ?Throwable $previous = null, ?int $httpStatus = null): self
    {
        return new self($message, true, $httpStatus, $previous);
    }

    public static function nonRetriable(string $message, ?Throwable $previous = null, ?int $httpStatus = null): self
    {
        return new self($message, false, $httpStatus, $previous);
    }

    public static function fromHttpStatus(string $message, ?int $httpStatus, ?Throwable $previous = null): self
    {
        return new self(
            $message,
            $httpStatus === null || $httpStatus >= 500 || in_array($httpStatus, self::RETRIABLE_HTTP_STATUSES, true),
            $httpStatus,
            $previous,
        );
    }

    public function isRetriable(): bool
    {
        return $this->retriable;
    }

    public function getHttpStatus(): ?int
    {
        return $this->httpStatus;
    }
}
