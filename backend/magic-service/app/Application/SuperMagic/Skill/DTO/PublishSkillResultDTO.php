<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Skill\DTO;

use App\Domain\SuperMagic\Skill\Entity\SkillVersionEntity;

final readonly class PublishSkillResultDTO
{
    public function __construct(
        public SkillVersionEntity $version,
        public ?string $sandboxId,
    ) {
    }
}
