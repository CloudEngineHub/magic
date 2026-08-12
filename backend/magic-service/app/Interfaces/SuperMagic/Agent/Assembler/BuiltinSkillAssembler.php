<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Agent\Assembler;

use App\Domain\SuperMagic\Skill\Entity\ValueObject\BuiltinSkill;
use App\Interfaces\SuperMagic\Agent\DTO\BuiltinSkillDTO;

class BuiltinSkillAssembler
{
    /**
     * @return array<BuiltinSkillDTO>
     */
    public static function createSkillListDTO(): array
    {
        $skills = [];
        foreach (BuiltinSkill::getAllBuiltinSkills() as $skillEnum) {
            $skills[] = new BuiltinSkillDTO([
                'code' => $skillEnum->value,
                'name' => $skillEnum->getSkillName(),
                'icon' => $skillEnum->getSkillIcon(),
                'description' => $skillEnum->getSkillDescription(),
            ]);
        }

        return $skills;
    }
}
