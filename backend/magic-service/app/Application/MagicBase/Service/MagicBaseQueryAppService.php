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
use App\Domain\MagicBase\Service\MagicBaseRowQueryCriteriaDomainService;
use App\Domain\MagicBase\Service\MagicBaseRowStorageResolverDomainService;
use App\Domain\MagicBase\Service\MagicBaseSelectParserDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

readonly class MagicBaseQueryAppService
{
    public function __construct(
        private MagicBaseAccessControlDomainService $accessControlDomainService,
        private MagicBaseQueryDomainService $queryDomainService,
        private MagicBaseRowQueryCriteriaDomainService $rowQueryCriteriaDomainService,
        private MagicBaseRowStorageResolverDomainService $rowStorageResolver,
        private MagicBaseSelectParserDomainService $selectParserDomainService,
    ) {
    }

    public function queryRows(MagicUserAuthorization $authorization, int $projectId, int $tableId, QueryRowsRequestDTO $requestDTO): MagicBasePageDTO
    {
        $context = $this->accessControlDomainService->requireReadableTable($authorization, $projectId, $tableId);
        $sorts = $requestDTO->getSort();
        $this->queryDomainService->assertSortableByOpenSearch($sorts);
        $filters = $this->queryDomainService->resolveFiltersForOpenSearch(
            $authorization,
            $projectId,
            $context->getTable(),
            $context->getAccess(),
            $context->getActor(),
            $requestDTO->getFilter()
        );
        $page = max(1, $requestDTO->getPage());
        $pageSize = max(1, $requestDTO->getPageSize());
        $query = $this->rowQueryCriteriaDomainService->buildReadableQuery(
            $authorization->getOrganizationCode(),
            $context->getTable(),
            $context->getAccess(),
            $context->getActor(),
            $filters,
            $sorts,
            $page,
            $pageSize,
        );
        $result = $this->rowStorageResolver->queryRows($query);
        /** @var MagicBaseRowEntity[] $rows */
        $rows = $result->getRows()->all();
        $select = $this->selectParserDomainService->parse($requestDTO->getSelect());
        $formattedRows = $this->queryDomainService->formatRows($authorization, $projectId, $context->getTable(), $rows, $context->getAccess(), $select, $context->getActor());

        return new MagicBasePageDTO(
            array_map(
                static fn ($row): MagicBaseRowDTO => new MagicBaseRowDTO($row),
                $formattedRows
            ),
            $page,
            $pageSize,
            $result->getTotal(),
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
            $this->selectParserDomainService->parse($select),
            $context->getActor(),
        ));
    }
}
