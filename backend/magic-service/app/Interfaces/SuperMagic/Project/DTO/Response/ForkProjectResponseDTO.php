<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Project\DTO\Response;

use App\Domain\SuperMagic\Project\Entity\ProjectForkEntity;

/**
 * Fork project response DTO.
 */
class ForkProjectResponseDTO
{
    public function __construct(
        public readonly string $status,
        public readonly string $recordId,
        public readonly string $projectId,
    ) {
    }

    public static function fromEntity(ProjectForkEntity $projectFork): self
    {
        return new self(
            status: $projectFork->getStatus()->value,
            recordId: (string) $projectFork->getId(),
            projectId: (string) $projectFork->getForkProjectId(),
        );
    }

    public function toArray(): array
    {
        return [
            'status' => $this->status,
            'project_id' => $this->projectId,
            'record_id' => $this->recordId,
        ];
    }
}
