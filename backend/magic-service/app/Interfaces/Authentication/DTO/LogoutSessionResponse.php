<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Authentication\DTO;

use App\Infrastructure\Core\AbstractDTO;

class LogoutSessionResponse extends AbstractDTO
{
    protected bool $sessionRevoked = false;

    protected string $externalSessionLogout = '';

    protected string $externalSessionLogoutReason = '';

    public function isSessionRevoked(): bool
    {
        return $this->sessionRevoked;
    }

    public function setSessionRevoked(bool $sessionRevoked): void
    {
        $this->sessionRevoked = $sessionRevoked;
    }

    public function getExternalSessionLogout(): string
    {
        return $this->externalSessionLogout;
    }

    public function setExternalSessionLogout(string $externalSessionLogout): void
    {
        $this->externalSessionLogout = $externalSessionLogout;
    }

    public function getExternalSessionLogoutReason(): string
    {
        return $this->externalSessionLogoutReason;
    }

    public function setExternalSessionLogoutReason(string $externalSessionLogoutReason): void
    {
        $this->externalSessionLogoutReason = $externalSessionLogoutReason;
    }
}
