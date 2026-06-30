<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageExpand\DTO;

class ImageExpandDriverResponse
{
    public function __construct(
        private readonly string $resultFilePath,
        private readonly string $mimeType,
    ) {
    }

    public function getResultFilePath(): string
    {
        return $this->resultFilePath;
    }

    public function getMimeType(): string
    {
        return $this->mimeType;
    }
}
