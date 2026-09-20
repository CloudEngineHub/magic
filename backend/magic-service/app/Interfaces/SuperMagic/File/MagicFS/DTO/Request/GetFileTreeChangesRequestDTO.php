<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\MagicFS\DTO\Request;

use Hyperf\HttpServer\Contract\RequestInterface;

/** Bounded durable file-tree change-feed request. */
class GetFileTreeChangesRequestDTO
{
    public int $since_revision = 0;

    public int $limit = 256;

    public static function fromRequest(RequestInterface $request): self
    {
        $data = $request->all();
        $dto = new self();
        $since = $data['since_revision'] ?? ($data['since'] ?? 0);
        $dto->since_revision = max(0, (int) $since);
        // limit=0 is a head-only request used during mount initialisation;
        // it returns the current cursor without loading any events.
        $dto->limit = max(0, min((int) ($data['limit'] ?? 256), 1000));

        return $dto;
    }
}
