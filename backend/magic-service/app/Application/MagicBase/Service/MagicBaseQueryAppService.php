<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\MagicBasePageDTO;
use App\Application\MagicBase\DTO\MagicBaseRowDTO;
use App\Application\MagicBase\DTO\QueryRowsRequestDTO;
use App\Application\MagicBase\Support\MagicBaseAccessControl;
use App\Application\MagicBase\Support\MagicBaseRowQuerySupport;
use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Service\MagicBaseRowQueryCriteriaDomainService;
use App\Domain\MagicBase\Service\MagicBaseRowStorageResolverDomainService;
use App\Domain\MagicBase\Service\MagicBaseSelectParserDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

readonly class MagicBaseQueryAppService
{
    public function __construct(
        private MagicBaseAccessControl $accessControl,
        private MagicBaseRowQuerySupport $rowQuerySupport,
        private MagicBaseRowQueryCriteriaDomainService $rowQueryCriteriaDomainService,
        private MagicBaseRowStorageResolverDomainService $rowStorageResolver,
        private MagicBaseSelectParserDomainService $selectParserDomainService,
    ) {
    }

    public function queryRows(MagicUserAuthorization $authorization, int $projectId, int $tableId, QueryRowsRequestDTO $requestDTO): MagicBasePageDTO
    {
        $context = $this->accessControl->requireReadableTable($authorization, $projectId, $tableId);
        $sorts = $requestDTO->getSort();
        $this->rowQuerySupport->assertSortableByRowStorage($sorts);
        $resolvedFilter = $this->rowQuerySupport->resolveFiltersForRowStorage(
            $authorization,
            $projectId,
            $context->getTable(),
            $context->getAccess(),
            $context->getActor(),
            $requestDTO->getFilter()
        );
        $page = max(1, $requestDTO->getPage());
        $pageSize = min(100, max(1, $requestDTO->getPageSize()));
        $query = $this->rowQueryCriteriaDomainService->buildReadableQuery(
            $authorization->getOrganizationCode(),
            $context->getTable(),
            $context->getAccess(),
            $context->getActor(),
            $resolvedFilter->getFilter(),
            $sorts,
            $page,
            $pageSize,
            false,
            $this->accessControl->getStaticReadableRecordIds($context),
            $requestDTO->includeTotal(),
            $resolvedFilter->getUnboundedInFields(),
        );
        $result = $this->rowStorageResolver->queryRows($query);
        /** @var MagicBaseRowEntity[] $rows */
        $rows = $result->getRows()->all();
        $select = $this->selectParserDomainService->parse($requestDTO->getSelect());
        $formattedRows = $this->rowQuerySupport->formatRows($authorization, $projectId, $context->getTable(), $rows, $context->getAccess(), $select, $context->getActor());

        return new MagicBasePageDTO(
            array_map(
                static fn ($row): MagicBaseRowDTO => new MagicBaseRowDTO($row),
                $formattedRows
            ),
            $page,
            $pageSize,
            $result->getTotal(),
            $result->hasMore(),
        );
    }

    public function showRow(MagicUserAuthorization $authorization, int $projectId, int $tableId, int $recordId, ?string $select = null): MagicBaseRowDTO
    {
        $context = $this->accessControl->requireReadableTable($authorization, $projectId, $tableId);
        $row = $this->accessControl->requireReadableRow($authorization, $context, $recordId);
        return new MagicBaseRowDTO($this->rowQuerySupport->formatRow(
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
