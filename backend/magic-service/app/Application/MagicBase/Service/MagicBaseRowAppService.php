<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\CreateRowRequestDTO;
use App\Application\MagicBase\DTO\MagicBaseRowDTO;
use App\Domain\MagicBase\Service\MagicBaseQueryDomainService;
use App\Domain\MagicBase\Service\MagicBaseRowDomainService;
use App\Domain\MagicBase\Service\MagicBaseRowStorageResolverDomainService;
use App\Domain\MagicBase\Service\MagicBaseSelectParserDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\DbConnection\Db;

readonly class MagicBaseRowAppService
{
    public function __construct(
        private MagicBaseAccessControlAppService $accessControlDomainService,
        private MagicBaseQueryDomainService $queryDomainService,
        private MagicBaseRowDomainService $rowDomainService,
        private MagicBaseRowStorageResolverDomainService $rowStorageResolver,
        private MagicBaseSelectParserDomainService $selectParserDomainService,
    ) {
    }

    public function createRow(MagicUserAuthorization $authorization, int $projectId, int $tableId, CreateRowRequestDTO $requestDTO): MagicBaseRowDTO
    {
        return Db::transaction(function () use ($authorization, $projectId, $tableId, $requestDTO): MagicBaseRowDTO {
            $context = $this->accessControlDomainService->requireInsertableTable($authorization, $projectId, $tableId);

            $data = $this->rowDomainService->normalizeRowPayload(
                $requestDTO->getData(),
                $context->getAccess()->getColumns(),
                true
            );
            $row = $this->rowStorageResolver->saveRow($this->rowDomainService->buildCreatePayload(
                $authorization->getOrganizationCode(),
                $projectId,
                $tableId,
                $authorization->getId(),
                $context->getActor(),
                $data,
            ));

            return new MagicBaseRowDTO($this->queryDomainService->formatRow(
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
            $context = $this->accessControlDomainService->requireWritableTable($authorization, $projectId, $tableId);
            $row = $this->accessControlDomainService->requireEditableRow($authorization, $context, $recordId);

            $normalized = $this->rowDomainService->normalizeRowPayload($requestDTO->getData(), $context->getAccess()->getColumns(), false);
            $this->accessControlDomainService->assertEditableColumns($context, $row, array_values(array_map('strval', array_keys($normalized))));

            $row = $this->rowStorageResolver->saveRow($this->rowDomainService->applyUpdate($row, $normalized));
            return new MagicBaseRowDTO($this->queryDomainService->formatRow(
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
            $context = $this->accessControlDomainService->requireWritableTable($authorization, $projectId, $tableId);
            $row = $this->accessControlDomainService->requireDeletableRow($authorization, $context, $recordId);

            $this->rowStorageResolver->saveRow($this->rowDomainService->markDeleted($row));
        });
    }
}
