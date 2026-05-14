<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO\Response;

use App\Interfaces\MagicBase\DTO\AbstractMagicBaseDTO;

class MagicBaseSuccessResponseDTO extends AbstractMagicBaseDTO
{
    protected bool $success = true;

    public function getSuccess(): bool
    {
        return $this->success;
    }

    public function setSuccess(bool $success): void
    {
        $this->success = $success;
    }
}
