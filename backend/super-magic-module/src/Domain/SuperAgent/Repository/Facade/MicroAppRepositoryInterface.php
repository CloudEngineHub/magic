<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade;

use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppListScope;

interface MicroAppRepositoryInterface
{
    public function findById(int $id): ?MicroAppEntity;

    public function findByProjectId(int $projectId): ?MicroAppEntity;

    public function ensureByProjectId(
        int $projectId,
        string $organizationCode,
        string $userId,
        string $creatorId
    ): MicroAppEntity;

    public function save(MicroAppEntity $entity): MicroAppEntity;

    /**
     * @return MicroAppEntity[]
     */
    public function findPublishedByOrganization(string $organizationCode): array;

    /**
     * @param string[] $departmentIds
     * @param string[] $organizationCodes
     * @return array{total:int,list:array<int,array<string,mixed>>}
     */
    public function paginateAccessible(
        string $userId,
        array $departmentIds,
        array $organizationCodes,
        MicroAppListScope $scope,
        string $keyword,
        int $page,
        int $pageSize
    ): array;
}
