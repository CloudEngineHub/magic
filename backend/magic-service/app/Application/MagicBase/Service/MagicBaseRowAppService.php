<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\CreateRowRequestDTO;
use App\Application\MagicBase\DTO\MagicBaseRowDTO;
use App\Application\MagicBase\Support\MagicBaseAccessControl;
use App\Application\MagicBase\Support\MagicBaseRowQuerySupport;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Service\MagicBaseRowDomainService;
use App\Domain\MagicBase\Service\MagicBaseRowStorageResolverDomainService;
use App\Domain\MagicBase\Service\MagicBaseSelectParserDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\DbConnection\Db;

readonly class MagicBaseRowAppService
{
    public function __construct(
        private MagicBaseAccessControl $accessControl,
        private MagicBaseRowQuerySupport $rowQuerySupport,
        private MagicBaseRowDomainService $rowDomainService,
        private MagicBaseRowStorageResolverDomainService $rowStorageResolver,
        private MagicBaseSelectParserDomainService $selectParserDomainService,
    ) {
    }

    public function createRow(MagicUserAuthorization $authorization, int $projectId, int $tableId, CreateRowRequestDTO $requestDTO): MagicBaseRowDTO
    {
        return Db::transaction(function () use ($authorization, $projectId, $tableId, $requestDTO): MagicBaseRowDTO {
            $context = $this->accessControl->requireInsertableTable($authorization, $projectId, $tableId);

            $data = $this->rowDomainService->normalizeRowPayload(
                $requestDTO->getData(),
                $context->getAccess()->getColumns(),
                true
            );
            $row = $this->rowStorageResolver->saveRow($this->rowDomainService->buildCreatePayload(
                $authorization->getOrganizationCode(),
                $projectId,
                $tableId,
                $context->getActor()->getUserId(),
                $context->getActor(),
                $data,
            ));

            return new MagicBaseRowDTO($this->rowQuerySupport->formatRow(
                $authorization,
                $projectId,
                $context->getTable(),
                $row,
                $context->getAccess(),
                $this->selectParserDomainService->parse($requestDTO->getSelect()),
                $context->getActor(),
            ));
        });
    }

    public function updateRow(MagicUserAuthorization $authorization, int $projectId, int $tableId, int $recordId, CreateRowRequestDTO $requestDTO): MagicBaseRowDTO
    {
        return Db::transaction(function () use ($authorization, $projectId, $tableId, $recordId, $requestDTO): MagicBaseRowDTO {
            $context = $this->accessControl->requireWritableTable($authorization, $projectId, $tableId);
            $row = $this->accessControl->requireEditableRow($authorization, $context, $recordId);

            $normalized = $this->rowDomainService->normalizeRowPayload($requestDTO->getData(), $context->getAccess()->getColumns(), false);
            $this->accessControl->assertEditableColumns($context, $row, array_values(array_map('strval', array_keys($normalized))));

            $row = $this->rowStorageResolver->saveRow($this->rowDomainService->applyUpdate($row, $normalized));
            return new MagicBaseRowDTO($this->rowQuerySupport->formatRow(
                $authorization,
                $projectId,
                $context->getTable(),
                $row,
                $context->getAccess(),
                $this->selectParserDomainService->parse($requestDTO->getSelect()),
                $context->getActor(),
            ));
        });
    }

    public function deleteRow(MagicUserAuthorization $authorization, int $projectId, int $tableId, int $recordId): void
    {
        Db::transaction(function () use ($authorization, $projectId, $tableId, $recordId): void {
            $context = $this->accessControl->requireWritableTable($authorization, $projectId, $tableId);
            $row = $this->accessControl->requireDeletableRow($authorization, $context, $recordId);

            $this->rowStorageResolver->saveRow($this->rowDomainService->markDeleted($row));
        });
    }

    /**
     * @param list<int> $recordIds
     * @return array{deleted_count: int, record_ids: list<string>}
     */
    public function batchDeleteRows(MagicUserAuthorization $authorization, int $projectId, int $tableId, array $recordIds): array
    {
        return Db::transaction(function () use ($authorization, $projectId, $tableId, $recordIds): array {
            if ($recordIds === []) {
                MagicBaseExceptionBuilder::parameterMissing('record_ids');
            }

            $context = $this->accessControl->requireWritableTable($authorization, $projectId, $tableId);
            $rows = [];
            foreach ($recordIds as $recordId) {
                $rows[$recordId] = $this->accessControl->requireDeletableRow($authorization, $context, $recordId);
            }

            $deletedRecordIds = [];
            foreach ($rows as $recordId => $row) {
                $this->rowStorageResolver->saveRow($this->rowDomainService->markDeleted($row));
                $deletedRecordIds[] = (string) $recordId;
            }

            return [
                'deleted_count' => count($deletedRecordIds),
                'record_ids' => $deletedRecordIds,
            ];
        });
    }
}
