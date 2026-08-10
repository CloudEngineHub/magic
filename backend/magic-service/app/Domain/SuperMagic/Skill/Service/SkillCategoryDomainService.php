<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Skill\Service;

use App\Domain\SuperMagic\Skill\Repository\Facade\SkillCategoryRepositoryInterface;

/**
 * Skill 分类领域服务.
 */
class SkillCategoryDomainService
{
    public function __construct(
        protected SkillCategoryRepositoryInterface $skillCategoryRepository
    ) {
    }
}
