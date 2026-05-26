<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence;

use App\Domain\MagicBase\Entity\MagicBaseProjectStorageRouteEntity;
use App\Domain\MagicBase\Repository\Facade\MagicBaseProjectStorageRouteRepositoryInterface;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseProjectStorageRouteModel;
use Throwable;

class MagicBaseProjectStorageRouteRepository implements MagicBaseProjectStorageRouteRepositoryInterface
{
    public function getRoute(string $organizationCode, int $projectId): ?MagicBaseProjectStorageRouteEntity
    {
        $model = MagicBaseProjectStorageRouteModel::query()
            ->where('organization_code', $organizationCode)
            ->where('project_id', $projectId)
            ->where('status', 'active')
            ->first();

        return $model === null ? null : new MagicBaseProjectStorageRouteEntity($model->toArray());
    }

    public function createRoute(MagicBaseProjectStorageRouteEntity $route): MagicBaseProjectStorageRouteEntity
    {
        try {
            $model = new MagicBaseProjectStorageRouteModel();
            $model->fill($route->toArray());
            $model->save();
            return new MagicBaseProjectStorageRouteEntity($model->toArray());
        } catch (Throwable $exception) {
            $existing = $this->getRoute($route->getOrganizationCode(), (int) $route->getProjectId());
            if ($existing !== null) {
                return $existing;
            }
            throw $exception;
        }
    }

    public function getProjectCountsByCollections(string $storageDriver, string $database, array $collections): array
    {
        $counts = array_fill_keys($collections, 0);
        if ($collections === []) {
            return $counts;
        }

        $rows = MagicBaseProjectStorageRouteModel::query()
            ->selectRaw('mongo_collection, COUNT(*) as project_count')
            ->where('storage_driver', $storageDriver)
            ->where('mongo_database', $database)
            ->where('status', 'active')
            ->whereIn('mongo_collection', $collections)
            ->groupBy('mongo_collection')
            ->get()
            ->toArray();

        foreach ($rows as $row) {
            $collection = (string) ($row['mongo_collection'] ?? '');
            if ($collection === '' || ! array_key_exists($collection, $counts)) {
                continue;
            }
            $counts[$collection] = (int) ($row['project_count'] ?? 0);
        }

        return $counts;
    }
}
