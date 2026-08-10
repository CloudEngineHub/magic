<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\DTO\Response;

class FileInfoResponseDTO
{
    public function __construct(
        public readonly string $fileName,
        public readonly int $currentVersion,
        public readonly string $organizationCode,
        public readonly string $relativeFilePath = ''
    ) {
    }

    public function toArray(): array
    {
        return [
            'file_name' => $this->fileName,
            'version' => $this->currentVersion,
            'organization_code' => $this->organizationCode,
            'relative_file_path' => $this->relativeFilePath,
        ];
    }
}
