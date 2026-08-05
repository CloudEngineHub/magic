<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowStoreRepositoryInterface;
use DateTimeInterface;
use Hyperf\Logger\LoggerFactory;
use LogicException;
use Throwable;

readonly class MagicBaseMongoRowStoreRepository implements MagicBaseRowStoreRepositoryInterface
{
    public function __construct(
        private MagicBaseMongoClient $client,
        private MagicBaseMongoCollectionRouter $router,
    ) {
    }

    public function saveRow(MagicBaseRowEntity $entity): MagicBaseRowEntity
    {
        [$projectId, $tableId] = $this->validateEntity($entity);

        $document = $this->toDocument($entity);
        $route = $this->router->route($entity->getDataOrganizationCode(), $projectId);
        try {
            $this->client->collection($route->getMongoCollection())->replaceOne(
                ['_id' => $document['_id']],
                $document,
                ['upsert' => true]
            );
        } catch (Throwable $exception) {
            di(LoggerFactory::class)->get(static::class)->error('MongoDB row storage write failed.', [
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
                'trace' => $exception->getTraceAsString(),
            ]);
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB row storage write failed.');
            throw new LogicException('Unreachable');
        }

        return new MagicBaseRowEntity($this->fromDocument($document));
    }

    /**
     * @param list<MagicBaseRowEntity> $entities
     * @return list<MagicBaseRowEntity>
     */
    public function saveRows(array $entities): array
    {
        if ($entities === []) {
            return [];
        }

        $operationsByCollection = [];
        $documents = [];
        foreach ($entities as $entity) {
            [$projectId] = $this->validateEntity($entity);
            $document = $this->toDocument($entity);
            $collection = $this->router
                ->route($entity->getDataOrganizationCode(), $projectId)
                ->getMongoCollection();
            $operationsByCollection[$collection][] = [
                'replaceOne' => [
                    ['_id' => $document['_id']],
                    $document,
                    ['upsert' => true],
                ],
            ];
            $documents[] = $document;
        }

        try {
            foreach ($operationsByCollection as $collection => $operations) {
                $this->client->collection($collection)->bulkWrite($operations, ['ordered' => true]);
            }
        } catch (Throwable $exception) {
            di(LoggerFactory::class)->get(static::class)->error('MongoDB row storage batch write failed.', [
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
                'trace' => $exception->getTraceAsString(),
            ]);
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB row storage batch write failed.');
            throw new LogicException('Unreachable');
        }

        return array_map(
            fn (array $document): MagicBaseRowEntity => new MagicBaseRowEntity($this->fromDocument($document)),
            $documents,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function toDocument(MagicBaseRowEntity $entity): array
    {
        $projectId = (int) $entity->getProjectId();
        $tableId = (int) $entity->getTableId();
        $recordId = (int) $entity->getRecordId();

        return [
            '_id' => $this->documentId($entity->getDataOrganizationCode(), $projectId, $tableId, $recordId),
            'data_organization_code' => $entity->getDataOrganizationCode(),
            'organization_code' => $entity->getOrganizationCode(),
            'project_id' => $projectId,
            'table_id' => $tableId,
            'record_id' => $recordId,
            'created_by' => $entity->getCreatedBy(),
            'owner_department_ids' => $entity->getOwnerDepartmentIds(),
            'deleted' => $entity->getDeleted(),
            'created_at' => $this->formatDateTime($entity->getCreatedAt()),
            'updated_at' => $this->formatDateTime($entity->getUpdatedAt()),
            'data' => $this->normalizeValue($entity->getData()),
        ];
    }

    /**
     * @param array<string, mixed> $document
     * @return array<string, mixed>
     */
    private function fromDocument(array $document): array
    {
        unset($document['_id']);
        return $this->normalizeValue($document);
    }

    private function documentId(string $organizationCode, int $projectId, int $tableId, int $recordId): string
    {
        return implode(':', [$organizationCode, $projectId, $tableId, $recordId]);
    }

    /**
     * @return array{0: int, 1: int, 2: int}
     */
    private function validateEntity(MagicBaseRowEntity $entity): array
    {
        $projectId = $entity->getProjectId();
        $tableId = $entity->getTableId();
        $recordId = $entity->getRecordId();
        if ($projectId === null || $tableId === null || $recordId === null) {
            MagicBaseExceptionBuilder::storageUnavailable('MagicBase row project_id, table_id and record_id are required for MongoDB storage.');
            throw new LogicException('Unreachable');
        }
        if ($entity->getDataOrganizationCode() === '') {
            MagicBaseExceptionBuilder::storageUnavailable('MagicBase row data_organization_code is required for MongoDB storage.');
            throw new LogicException('Unreachable');
        }
        return [$projectId, $tableId, $recordId];
    }

    private function formatDateTime(?DateTimeInterface $value): ?string
    {
        return $value?->format('Y-m-d H:i:s');
    }

    private function normalizeValue(mixed $value): mixed
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }
        if (! is_array($value)) {
            return $value;
        }

        $normalized = [];
        foreach ($value as $key => $item) {
            $normalized[$key] = $this->normalizeValue($item);
        }

        return $normalized;
    }
}
