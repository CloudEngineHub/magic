<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseProjectStorageRouteEntity;

interface MagicBaseProjectStorageRouteRepositoryInterface
{
    public function getRoute(string $organizationCode, int $projectId): ?MagicBaseProjectStorageRouteEntity;

    public function createRoute(MagicBaseProjectStorageRouteEntity $route): MagicBaseProjectStorageRouteEntity;

    /**
     * @param list<string> $collections
     * @return array<string, int> project count keyed by mongo collection
     */
    public function getProjectCountsByCollections(string $storageDriver, string $database, array $collections): array;
}
