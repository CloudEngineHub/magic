<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB;

use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Repository\Facade\MagicBaseProjectStorageRouteRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowCleanupRepositoryInterface;
use Hyperf\Logger\LoggerFactory;
use LogicException;
use Throwable;

readonly class MagicBaseMongoProjectCleanupRepository implements MagicBaseRowCleanupRepositoryInterface
{
    public function __construct(
        private MagicBaseMongoClient $client,
        private MagicBaseProjectStorageRouteRepositoryInterface $routeRepository,
        private LoggerFactory $loggerFactory,
    ) {
    }

    public function deleteProjectRows(string $organizationCode, int $projectId): void
    {
        $route = $this->routeRepository->getRoute($organizationCode, $projectId);
        if ($route === null) {
            return;
        }

        try {
            $this->client->client()
                ->selectCollection($route->getMongoDatabase(), $route->getMongoCollection())
                ->deleteMany([
                    'data_organization_code' => $organizationCode,
                    'project_id' => $projectId,
                ], [
                    'maxTimeMS' => $this->client->queryTimeoutMs(),
                ]);
        } catch (Throwable $exception) {
            $this->loggerFactory->get(static::class)->error('MongoDB project row cleanup failed.', [
                'organization_code' => $organizationCode,
                'project_id' => $projectId,
                'collection' => $route->getMongoCollection(),
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB project row cleanup failed.');
            throw new LogicException('Unreachable');
        }
    }
}
