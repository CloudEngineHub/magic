<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\MagicFS\DTO\Response;

class FileVersionResponseDTO
{
    public int $version = 1;

    public function toArray(): array
    {
        return [
            'version' => $this->version,
        ];
    }
}
