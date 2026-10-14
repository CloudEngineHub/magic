<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Common\Repository;

use App\Domain\SuperMagic\Agent\Repository\Persistence\Model\SuperMagicAgentModel;
use App\Domain\SuperMagic\Project\Repository\Model\ProjectModel;
use App\Domain\SuperMagic\Skill\Repository\Persistence\Model\SkillModel;
use Hyperf\Database\Model\Model;

/** Persistence seam for locking and changing ownership without rewriting resource content. */
class ResourceTransferRepository
{
    public function lock(bool $isAgent, string $organizationCode, string $code): ?Model
    {
        $model = $isAgent ? SuperMagicAgentModel::class : SkillModel::class;
        return $model::query()->where('organization_code', $organizationCode)
            ->where('code', $code)->lockForUpdate()->first();
    }

    public function lockProject(int $projectId): ?Model
    {
        return ProjectModel::query()->where('id', $projectId)->lockForUpdate()->first();
    }

    public function changeOwner(Model $resource, bool $isAgent, string $receiverId): void
    {
        $resource->setAttribute($isAgent ? 'creator' : 'creator_id', $receiverId);
        $resource->save();
    }
}
