<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\Skill\DTO;

use Dtyq\SuperMagic\Domain\Skill\Entity\SkillVersionEntity;

final readonly class PublishSkillResultDTO
{
    public function __construct(
        public SkillVersionEntity $version,
        public ?string $sandboxId,
    ) {
    }
}
