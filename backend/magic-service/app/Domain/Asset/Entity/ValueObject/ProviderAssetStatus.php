<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Entity\ValueObject;

enum ProviderAssetStatus: string
{
    case PROCESSING = 'PROCESSING';
    case ACTIVE = 'ACTIVE';
    case FAILED = 'FAILED';
    case UNKNOWN = 'UNKNOWN';

    public static function fromValue(mixed $value): self
    {
        return self::tryFrom(strtoupper((string) $value)) ?? self::UNKNOWN;
    }

    public function isActive(): bool
    {
        return $this === self::ACTIVE;
    }

    public function isProcessing(): bool
    {
        return $this === self::PROCESSING || $this === self::UNKNOWN;
    }
}
