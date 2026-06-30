<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Authentication\DTO;

use App\Infrastructure\Core\AbstractDTO;

class LogoutSessionRequest extends AbstractDTO
{
    protected string $authorization = '';

    protected array $device = [];

    protected string $organizationCode = '';

    protected string $apiKey = '';

    public function getAuthorization(): string
    {
        return $this->authorization;
    }

    public function setAuthorization(string $authorization): void
    {
        $this->authorization = $authorization;
    }

    public function getDevice(): array
    {
        return $this->device;
    }

    public function setDevice(mixed $device): void
    {
        $this->device = is_array($device) ? $device : [];
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(string $organizationCode): void
    {
        $this->organizationCode = $organizationCode;
    }

    public function getApiKey(): string
    {
        return $this->apiKey;
    }

    public function setApiKey(string $apiKey): void
    {
        $this->apiKey = $apiKey;
    }
}
