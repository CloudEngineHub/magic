<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\MagicBasePageDTO;
use App\Application\MagicBase\DTO\MagicBaseRowDTO;
use App\Application\MagicBase\DTO\QueryRowsRequestDTO;
use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Service\MagicBaseAccessControlDomainService;
use App\Domain\MagicBase\Service\MagicBaseQueryDomainService;
use App\Domain\MagicBase\Service\MagicBaseRowStorageResolverDomainService;
use App\Domain\MagicBase\Service\MagicBaseSelectParserDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

readonly class MagicBaseQueryAppService
{
    public function __construct(
        private MagicBaseAccessControlDomainService $accessControlDomainService,
        private MagicBaseQueryDomainService $queryDomainService,
        private MagicBaseRowStorageResolverDomainService $rowStorageResolver,
        private MagicBaseSelectParserDomainService $selectParserDomainService,
    ) {
    }

    public function queryRows(MagicUserAuthorization $authorization, int $projectId, int $tableId, QueryRowsRequestDTO $requestDTO): MagicBasePageDTO
    {
        $payload = $requestDTO->toArray();
        $context = $this->accessControlDomainService->requireReadableTable($authorization, $projectId, $tableId);
        $rows = $this->accessControlDomainService->filterReadableRows($context, $this->rowStorageResolver->listRows($authorization->getOrganizationCode(), $tableId));

        $rows = $this->queryDomainService->applyFilters($authorization, $projectId, $context->getTable(), $rows, $payload['filter'] ?? [], $context->getActor(), $context->getAccess());
        $total = count($rows);
        $rows = $this->queryDomainService->applySort($rows, is_array($payload['sort'] ?? null) ? $payload['sort'] : []);

        $page = max(1, (int) ($payload['page'] ?? 1));
        $pageSize = max(1, (int) ($payload['page_size'] ?? 20));
        /** @var MagicBaseRowEntity[] $rows */
        $rows = array_slice($rows->all(), ($page - 1) * $pageSize, $pageSize);
        $select = $this->selectParserDomainService->parse((string) ($payload['select'] ?? ''))->toArray();

        return new MagicBasePageDTO(
            array_map(
                fn (MagicBaseRowEntity $row): MagicBaseRowDTO => new MagicBaseRowDTO($this->queryDomainService->formatRow($authorization, $projectId, $context->getTable(), $row, $context->getAccess(), $select, $context->getActor())),
                $rows
            ),
            $page,
            $pageSize,
            $total,
        );
    }

    public function showRow(MagicUserAuthorization $authorization, int $projectId, int $tableId, int $recordId, ?string $select = null): MagicBaseRowDTO
    {
        $context = $this->accessControlDomainService->requireReadableTable($authorization, $projectId, $tableId);
        $row = $this->accessControlDomainService->requireReadableRow($authorization, $context, $recordId);
        return new MagicBaseRowDTO($this->queryDomainService->formatRow(
            $authorization,
            $projectId,
            $context->getTable(),
            $row,
            $context->getAccess(),
            $this->selectParserDomainService->parse($select)->toArray(),
            $context->getActor(),
        ));
    }
}
