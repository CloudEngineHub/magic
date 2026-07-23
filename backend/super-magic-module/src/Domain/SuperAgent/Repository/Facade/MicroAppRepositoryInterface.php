<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade;

use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;

interface MicroAppRepositoryInterface
{
    public function findById(int $id): ?MicroAppEntity;

    public function findByProjectId(int $projectId): ?MicroAppEntity;

    public function ensureByProjectId(
        int $projectId,
        string $organizationCode,
        string $userId
    ): MicroAppEntity;

    public function save(MicroAppEntity $entity): MicroAppEntity;

    /**
     * @return MicroAppEntity[]
     */
    public function findPublishedByOrganization(string $organizationCode): array;
}
