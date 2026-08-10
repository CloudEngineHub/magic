<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\DTO\Response;

class FileNameResponseDTO
{
    public function __construct(
        public readonly string $fileName
    ) {
    }

    public function toArray(): array
    {
        return [
            'file_name' => $this->fileName,
        ];
    }
}
