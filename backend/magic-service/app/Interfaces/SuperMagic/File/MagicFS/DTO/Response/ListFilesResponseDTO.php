<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\MagicFS\DTO\Response;

class ListFilesResponseDTO
{
    /**
     * @var MagicFSFileDTO[]
     */
    public array $files = [];

    public function toArray(): array
    {
        return [
            'files' => array_map(fn ($file) => $file->toArray(), $this->files),
        ];
    }
}
