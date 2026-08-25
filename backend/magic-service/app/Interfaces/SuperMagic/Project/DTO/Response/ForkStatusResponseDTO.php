<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Project\DTO\Response;

use App\Domain\SuperMagic\Project\Entity\ProjectForkEntity;

/**
 * Fork status response DTO.
 */
class ForkStatusResponseDTO
{
    public function __construct(
        public readonly string $status,
        public readonly string $progress,
        public readonly string $errMsg,
    ) {
    }

    public static function fromEntity(ProjectForkEntity $projectFork): self
    {
        return new self(
            status: $projectFork->getStatus()->value,
            progress: $projectFork->getProgressPercentage(),
            errMsg: $projectFork->getErrMsg() ?? '',
        );
    }

    public function toArray(): array
    {
        return [
            'status' => $this->status,
            'progress' => $this->progress,
            'err_msg' => $this->errMsg,
        ];
    }
}
