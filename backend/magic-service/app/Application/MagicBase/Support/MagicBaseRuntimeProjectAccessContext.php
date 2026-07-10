<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Support;

use Hyperf\Context\Context;

final class MagicBaseRuntimeProjectAccessContext
{
    private const string SHARE_ACCESS_PROJECT_IDS = 'magicbase.share_access_project_ids';

    public static function allowShareAccess(int $projectId): void
    {
        $projectIds = self::projectIds();
        $projectIds[$projectId] = true;
        Context::set(self::SHARE_ACCESS_PROJECT_IDS, $projectIds);
    }

    public static function hasShareAccess(int $projectId): bool
    {
        return self::projectIds()[$projectId] ?? false;
    }

    /**
     * @return array<int, bool>
     */
    private static function projectIds(): array
    {
        $projectIds = Context::get(self::SHARE_ACCESS_PROJECT_IDS, []);
        return is_array($projectIds) ? $projectIds : [];
    }
}
