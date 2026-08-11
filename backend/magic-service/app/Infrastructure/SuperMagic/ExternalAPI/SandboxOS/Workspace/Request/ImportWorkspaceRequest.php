<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Workspace\Request;

use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Contract\RequestInterface;

/**
 * Workspace import request.
 * Maps to the sandbox API: POST /api/v1/workspace/import.
 */
class ImportWorkspaceRequest implements RequestInterface
{
    public function __construct(
        private readonly string $url,
        private readonly string $targetDir = '',
    ) {
    }

    public function getUrl(): string
    {
        return $this->url;
    }

    public function getTargetDir(): string
    {
        return $this->targetDir;
    }

    public function toArray(): array
    {
        return [
            'url' => $this->url,
            'target_dir' => $this->targetDir,
        ];
    }
}
