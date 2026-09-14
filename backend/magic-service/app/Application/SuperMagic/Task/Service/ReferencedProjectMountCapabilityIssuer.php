<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Task\Service;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Infrastructure\SuperMagic\Utils\AccessTokenUtil;

/**
 * Issue a short-lived, read-only capability for a validated share mount.
 */
class ReferencedProjectMountCapabilityIssuer
{
    private const TTL_SECONDS = 300;

    public function issue(
        ReferencedProjectMount $mount,
        MicroAppEntity $record,
        ResourceShareEntity $shareEntity,
        DataIsolation $dataIsolation,
    ): string {
        return AccessTokenUtil::generate(
            (string) $shareEntity->getId(),
            $shareEntity->getOrganizationCode(),
            'read',
            self::TTL_SECONDS,
            [
                'source' => 'micro_app_mount',
                'app_id' => (string) $record->getId(),
                'project_id' => $mount->projectId,
                'user_id' => $dataIsolation->getCurrentUserId(),
            ],
        );
    }
}
