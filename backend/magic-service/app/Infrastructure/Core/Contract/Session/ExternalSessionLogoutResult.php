<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Core\Contract\Session;

readonly class ExternalSessionLogoutResult
{
    public const string STATUS_SUCCESS = 'success';

    public const string STATUS_FAILED = 'failed';

    public const string STATUS_SKIPPED = 'skipped';

    private function __construct(
        private string $status,
        private string $reason = '',
    ) {
    }

    public static function success(string $reason = ''): self
    {
        return new self(self::STATUS_SUCCESS, $reason);
    }

    public static function failed(string $reason = ''): self
    {
        return new self(self::STATUS_FAILED, $reason);
    }

    public static function skipped(string $reason = ''): self
    {
        return new self(self::STATUS_SKIPPED, $reason);
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getReason(): string
    {
        return $this->reason;
    }
}
