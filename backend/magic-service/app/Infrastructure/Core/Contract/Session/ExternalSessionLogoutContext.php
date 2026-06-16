<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Core\Contract\Session;

readonly class ExternalSessionLogoutContext
{
    public function __construct(
        private string $authorization,
        private string $shortToken,
        private array $device = [],
        private string $organizationCode = '',
        private string $apiKey = '',
        private string $magicId = '',
        private int $magicEnvId = 0,
        private int $tokenId = 0,
    ) {
    }

    public function getAuthorization(): string
    {
        return $this->authorization;
    }

    public function getShortToken(): string
    {
        return $this->shortToken;
    }

    public function getDevice(): array
    {
        return $this->device;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getApiKey(): string
    {
        return $this->apiKey;
    }

    public function getMagicId(): string
    {
        return $this->magicId;
    }

    public function getMagicEnvId(): int
    {
        return $this->magicEnvId;
    }

    public function getTokenId(): int
    {
        return $this->tokenId;
    }
}
