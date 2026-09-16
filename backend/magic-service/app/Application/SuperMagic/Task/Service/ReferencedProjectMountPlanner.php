<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Task\Service;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionType;

/**
 * Extract unique cross-project mount targets from mentions that differ
 * from the current project.
 *
 * Collaboration mentions (@project / file / directory) and validated
 * micro-app mentions share the same project mount.
 */
final class ReferencedProjectMountPlanner
{
    private const COLLABORATION_TYPES = [
        MentionType::PROJECT->value,
        MentionType::PROJECT_FILE->value,
        MentionType::PROJECT_DIRECTORY->value,
    ];

    /**
     * @param array<int, mixed> $mentions
     * @return list<ReferencedProjectMount>
     */
    public function plan(array $mentions, int $currentProjectId): array
    {
        $mountsByProjectId = [];

        foreach ($mentions as $mention) {
            if (! is_array($mention)) {
                continue;
            }

            $mount = $this->toMount($mention, $currentProjectId);
            if ($mount === null) {
                continue;
            }

            $existing = $mountsByProjectId[$mount->projectId] ?? null;
            if ($existing === null || $this->shouldReplace($existing, $mount)) {
                $mountsByProjectId[$mount->projectId] = $mount;
            }
        }

        return array_values($mountsByProjectId);
    }

    /**
     * @param array<string, mixed> $mention
     */
    private function toMount(array $mention, int $currentProjectId): ?ReferencedProjectMount
    {
        $type = (string) ($mention['type'] ?? '');
        $accessKind = $this->resolveAccessKind($type, $mention);
        if ($accessKind === null) {
            return null;
        }

        $projectIdRaw = $mention['project_id'] ?? null;
        if ((! is_string($projectIdRaw) && ! is_int($projectIdRaw)) || ! preg_match('/^[1-9][0-9]*$/D', (string) $projectIdRaw)) {
            return null;
        }
        $projectId = (string) $projectIdRaw;
        if ((string) (int) $projectId !== $projectId || $projectId === (string) $currentProjectId) {
            return null;
        }

        $appId = trim((string) ($mention['app_id'] ?? ''));
        // Do not mount @micro_app from leftover project_id after enrich fails.
        if ($accessKind === ReferencedProjectAccessKind::PublishedShare && $appId === '') {
            return null;
        }

        return new ReferencedProjectMount(
            projectId: $projectId,
            accessKind: $accessKind,
            sourceType: $type,
            appId: $appId !== '' ? $appId : null,
        );
    }

    /**
     * @param array<string, mixed> $mention
     */
    private function resolveAccessKind(string $type, array $mention): ?ReferencedProjectAccessKind
    {
        if ($type === MentionType::MICRO_APP->value) {
            // Only mentions validated as project collaboration are mountable.
            if (($mention['access_kind'] ?? '') === ReferencedProjectAccessKind::Collaboration->value) {
                return ReferencedProjectAccessKind::Collaboration;
            }

            return null;
        }
        if (in_array($type, self::COLLABORATION_TYPES, true)) {
            return ReferencedProjectAccessKind::Collaboration;
        }

        return null;
    }

    private function shouldReplace(ReferencedProjectMount $existing, ReferencedProjectMount $candidate): bool
    {
        return $existing->accessKind === ReferencedProjectAccessKind::PublishedShare
            && $candidate->accessKind === ReferencedProjectAccessKind::Collaboration;
    }
}
