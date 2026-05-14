<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\RelationRequestDTO;
use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseRelationEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\Domain\MagicBase\Service\MagicBaseAccessControlDomainService;
use App\Domain\MagicBase\Service\MagicBaseMigrationLogDomainService;
use App\Domain\MagicBase\Service\MagicBaseRelationDomainService;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\DbConnection\Db;

readonly class MagicBaseRelationAppService
{
    public function __construct(
        private MagicBaseTableRepository $repository,
        private MagicBaseAccessControlDomainService $accessControlDomainService,
        private MagicBaseRelationDomainService $relationDomainService,
        private MagicBaseMigrationLogDomainService $migrationLogDomainService,
    ) {
    }

    public function createRelation(MagicUserAuthorization $authorization, int $projectId, RelationRequestDTO $requestDTO): MagicBaseRelationEntity
    {
        return Db::transaction(function () use ($authorization, $projectId, $requestDTO): MagicBaseRelationEntity {
            $sourceTableId = $this->parsePayloadId($requestDTO->getSourceTableId(), '源表ID');
            $sourceColumnId = $this->parsePayloadId($requestDTO->getSourceColumnId(), '源字段ID');
            $targetTableId = $this->parsePayloadId($requestDTO->getTargetTableId(), '目标表ID');
            $targetColumnId = $this->parsePayloadId($requestDTO->getTargetColumnId(), '目标字段ID');
            $relationType = trim((string) $requestDTO->getRelationType());
            $relationName = trim((string) $requestDTO->getRelationName());

            $sourceTable = $this->accessControlDomainService->requireTableManager($authorization, $projectId, $sourceTableId)->getTable();
            $targetTable = $this->getTableOrFail($authorization, $projectId, $targetTableId);
            $sourceColumn = $this->getColumnOrFail($authorization, $sourceTableId, $sourceColumnId);
            $targetColumn = $this->getColumnOrFail($authorization, $targetTableId, $targetColumnId);
            if ((int) $sourceColumn->getTableId() !== (int) $sourceTable->getId() || (int) $targetColumn->getTableId() !== (int) $targetTable->getId()) {
                $this->invalid('关系字段');
            }
            if ($this->repository->getRelationByName($authorization->getOrganizationCode(), $sourceTableId, $relationName) !== null) {
                $this->invalid('关系名称已存在');
            }

            $relation = $this->repository->saveRelation($this->relationDomainService->buildCreatePayload(
                $authorization->getOrganizationCode(),
                $projectId,
                $sourceTableId,
                $sourceColumn->getColumnKey(),
                $targetTableId,
                $targetColumn->getColumnKey(),
                $relationType,
                $relationName,
            ));

            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                null,
                MagicBaseConst::CHANGE_CREATE,
                MagicBaseConst::TARGET_RELATION,
                (int) $relation->getId(),
                null,
                $relation,
            ));

            return $relation;
        });
    }

    public function listRelations(MagicUserAuthorization $authorization, int $projectId): MagicBaseEntityCollection
    {
        return $this->repository->listRelations($authorization->getOrganizationCode(), $projectId);
    }

    public function updateRelation(MagicUserAuthorization $authorization, int $projectId, int $relationId, RelationRequestDTO $requestDTO): MagicBaseRelationEntity
    {
        return Db::transaction(function () use ($authorization, $projectId, $relationId, $requestDTO): MagicBaseRelationEntity {
            $relation = $this->getRelationOrFail($authorization, $projectId, $relationId);
            $this->accessControlDomainService->requireTableManager($authorization, $projectId, (int) $relation->getSourceTableId());
            $before = $relation;

            $sourceTableId = $requestDTO->hasSourceTableId() ? $this->parsePayloadId($requestDTO->getSourceTableId(), '源表ID') : (int) $relation->getSourceTableId();
            $sourceColumnId = $requestDTO->hasSourceColumnId() ? $this->parsePayloadId($requestDTO->getSourceColumnId(), '源字段ID') : null;
            $targetTableId = $requestDTO->hasTargetTableId() ? $this->parsePayloadId($requestDTO->getTargetTableId(), '目标表ID') : (int) $relation->getTargetTableId();
            $targetColumnId = $requestDTO->hasTargetColumnId() ? $this->parsePayloadId($requestDTO->getTargetColumnId(), '目标字段ID') : null;
            $relationName = $requestDTO->hasRelationName() ? trim((string) $requestDTO->getRelationName()) : $relation->getRelationName();
            $relationType = $requestDTO->hasRelationType() ? trim((string) $requestDTO->getRelationType()) : $relation->getRelationType();

            $this->getTableOrFail($authorization, $projectId, $sourceTableId);
            $this->getTableOrFail($authorization, $projectId, $targetTableId);
            if ($sourceColumnId !== null) {
                $sourceColumn = $this->getColumnOrFail($authorization, $sourceTableId, $sourceColumnId);
                $relation->setSourceColumnKey($sourceColumn->getColumnKey());
            }
            if ($targetColumnId !== null) {
                $targetColumn = $this->getColumnOrFail($authorization, $targetTableId, $targetColumnId);
                $relation->setTargetColumnKey($targetColumn->getColumnKey());
            }

            $existing = $this->repository->getRelationByName($authorization->getOrganizationCode(), $sourceTableId, $relationName);
            if ($existing !== null && (int) $existing->getId() !== $relationId) {
                $this->invalid('关系名称已存在');
            }

            $relation = $this->relationDomainService->applyUpdate($relation, $sourceTableId, $targetTableId, $relationType, $relationName);
            $relation = $this->repository->saveRelation($relation);
            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                null,
                MagicBaseConst::CHANGE_UPDATE,
                MagicBaseConst::TARGET_RELATION,
                $relationId,
                $before,
                $relation,
            ));

            return $relation;
        });
    }

    public function deleteRelation(MagicUserAuthorization $authorization, int $projectId, int $relationId): void
    {
        Db::transaction(function () use ($authorization, $projectId, $relationId): void {
            $relation = $this->getRelationOrFail($authorization, $projectId, $relationId);
            $this->accessControlDomainService->requireTableManager($authorization, $projectId, (int) $relation->getSourceTableId());
            $this->repository->deleteRelation($relationId);
            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                null,
                MagicBaseConst::CHANGE_DELETE,
                MagicBaseConst::TARGET_RELATION,
                $relationId,
                $relation,
                null,
            ));
        });
    }

    private function getTableOrFail(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableEntity
    {
        $table = $this->repository->getTable($authorization->getOrganizationCode(), $projectId, $tableId);
        if ($table === null) {
            $this->invalid('数据表');
        }
        return $table;
    }

    private function getColumnOrFail(MagicUserAuthorization $authorization, int $tableId, int $columnId): MagicBaseColumnEntity
    {
        $column = $this->repository->getColumn($authorization->getOrganizationCode(), $tableId, $columnId);
        if ($column === null) {
            $this->invalid('字段');
        }
        return $column;
    }

    private function getRelationOrFail(MagicUserAuthorization $authorization, int $projectId, int $relationId): MagicBaseRelationEntity
    {
        $relation = $this->repository->getRelation($authorization->getOrganizationCode(), $projectId, $relationId);
        if ($relation === null) {
            $this->invalid('关系');
        }
        return $relation;
    }

    private function parsePayloadId(mixed $value, string $label): int
    {
        if (is_int($value)) {
            return $value;
        }
        if (! is_string($value) || ! ctype_digit($value)) {
            $this->invalid($label);
        }
        return (int) $value;
    }

    private function invalid(string $label): void
    {
        ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $label]);
    }
}
