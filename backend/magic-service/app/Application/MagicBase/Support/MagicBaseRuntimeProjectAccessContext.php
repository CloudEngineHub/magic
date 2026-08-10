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

    private const string SHARE_ACCESS_ACTORS = 'magicbase.share_access_actors';

    public static function allowShareAccess(int $projectId, string $actorUserId = '', string $actorOrganizationCode = ''): void
    {
        $projectIds = self::projectIds();
        $projectIds[$projectId] = true;
        Context::set(self::SHARE_ACCESS_PROJECT_IDS, $projectIds);

        $actors = self::actors();
        $actors[$projectId] = [
            'user_id' => $actorUserId,
            'organization_code' => $actorOrganizationCode,
        ];
        Context::set(self::SHARE_ACCESS_ACTORS, $actors);
    }

    public static function hasShareAccess(int $projectId): bool
    {
        return self::projectIds()[$projectId] ?? false;
    }

    /**
     * @return null|array{user_id: string, organization_code: string}
     */
    public static function getShareActor(int $projectId): ?array
    {
        $actor = self::actors()[$projectId] ?? null;
        if (! is_array($actor)) {
            return null;
        }

        return [
            'user_id' => (string) ($actor['user_id'] ?? ''),
            'organization_code' => (string) ($actor['organization_code'] ?? ''),
        ];
    }

    /**
     * @return array<int, bool>
     */
    private static function projectIds(): array
    {
        $projectIds = Context::get(self::SHARE_ACCESS_PROJECT_IDS, []);
        return is_array($projectIds) ? $projectIds : [];
    }

    /**
     * @return array<int, array{user_id?: string, organization_code?: string}>
     */
    private static function actors(): array
    {
        $actors = Context::get(self::SHARE_ACCESS_ACTORS, []);
        return is_array($actors) ? $actors : [];
    }
}
