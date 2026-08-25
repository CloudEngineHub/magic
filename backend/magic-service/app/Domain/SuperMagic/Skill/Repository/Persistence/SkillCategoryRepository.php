<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Skill\Repository\Persistence;

use App\Domain\SuperMagic\Skill\Repository\Facade\SkillCategoryRepositoryInterface;
use App\Domain\SuperMagic\Skill\Repository\Persistence\Model\SkillCategoryModel;
use App\Infrastructure\Core\AbstractRepository;

/**
 * Skill 分类仓储实现.
 */
class SkillCategoryRepository extends AbstractRepository implements SkillCategoryRepositoryInterface
{
    public function __construct(
        protected SkillCategoryModel $skillCategoryModel
    ) {
    }
}
