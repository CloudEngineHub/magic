<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\MagicFS\DTO\Response;

class FileVersionsResponseDTO
{
    /**
     * @var array<string, int> file_id => version 的映射
     */
    public array $versions = [];

    public function toArray(): array
    {
        return [
            'versions' => $this->versions,
        ];
    }
}
