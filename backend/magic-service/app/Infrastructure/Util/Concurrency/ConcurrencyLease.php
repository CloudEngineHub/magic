<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\Concurrency;

readonly class ConcurrencyLease
{
    private function __construct(
        private string $resourceId,
        private string $token,
        private bool $canProceed,
        private bool $ownsSlot,
    ) {
    }

    public static function acquired(string $resourceId, string $token): self
    {
        return new self($resourceId, $token, true, true);
    }

    public static function blocked(string $resourceId): self
    {
        return new self($resourceId, '', false, false);
    }

    public static function unlimited(string $resourceId): self
    {
        return new self($resourceId, '', true, false);
    }

    public function canProceed(): bool
    {
        return $this->canProceed;
    }

    public function ownsSlot(): bool
    {
        return $this->ownsSlot;
    }

    public function getResourceId(): string
    {
        return $this->resourceId;
    }

    public function getToken(): string
    {
        return $this->token;
    }
}
