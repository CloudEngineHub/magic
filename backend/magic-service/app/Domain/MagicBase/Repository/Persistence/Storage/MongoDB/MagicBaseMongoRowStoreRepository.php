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
        $projectId = $entity->getProjectId();
        $tableId = $entity->getTableId();
        $recordId = $entity->getRecordId();
        if ($projectId === null || $tableId === null || $recordId === null) {
            MagicBaseExceptionBuilder::storageUnavailable('MagicBase row project_id, table_id and record_id are required for MongoDB storage.');
            throw new LogicException('Unreachable');
        }

        $document = $this->toDocument($entity);
        $route = $this->router->route($entity->getOrganizationCode(), $projectId);
        try {
            $this->client->collection($route->getMongoCollection())->replaceOne(
                ['_id' => $document['_id']],
                $document,
                ['upsert' => true]
            );
        } catch (Throwable) {
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB row storage write failed.');
            throw new LogicException('Unreachable');
        }

        return new MagicBaseRowEntity($this->fromDocument($document));
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
            '_id' => $this->documentId($entity->getOrganizationCode(), $projectId, $tableId, $recordId),
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
