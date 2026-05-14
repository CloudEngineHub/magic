<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\SubjectRequestDTO;
use App\Domain\MagicBase\Entity\MagicBaseProjectAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableAdminEntity;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\Domain\MagicBase\Service\MagicBaseAccessControlDomainService;
use App\Domain\MagicBase\Service\MagicBaseAdminDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use DateTime;

readonly class MagicBaseAdminAppService
{
    public function __construct(
        private MagicBaseTableRepository $repository,
        private MagicBaseAccessControlDomainService $accessControlDomainService,
        private MagicBaseAdminDomainService $adminDomainService,
    ) {
    }

    public function createProjectAdmin(MagicUserAuthorization $authorization, int $projectId, SubjectRequestDTO $requestDTO): MagicBaseProjectAdminEntity
    {
        $this->accessControlDomainService->requireProjectManager($authorization, $projectId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), false);
        return $this->repository->createProjectAdmin([
            'organization_code' => $authorization->getOrganizationCode(),
            'project_id' => $projectId,
            'subject_type' => $subject->getSubjectType(),
            'subject_id' => $subject->getSubjectId(),
            'created_at' => new DateTime(),
            'updated_at' => new DateTime(),
        ]);
    }

    public function createTableAdmin(MagicUserAuthorization $authorization, int $projectId, int $tableId, SubjectRequestDTO $requestDTO): MagicBaseTableAdminEntity
    {
        $this->accessControlDomainService->requireTableManager($authorization, $projectId, $tableId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), false);
        return $this->repository->createTableAdmin([
            'organization_code' => $authorization->getOrganizationCode(),
            'table_id' => $tableId,
            'subject_type' => $subject->getSubjectType(),
            'subject_id' => $subject->getSubjectId(),
            'created_at' => new DateTime(),
            'updated_at' => new DateTime(),
        ]);
    }
}
