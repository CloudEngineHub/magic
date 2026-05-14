<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBasePermissionSubject;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

readonly class MagicBaseAdminDomainService
{
    public function __construct(
        private MagicDepartmentUserDomainService $departmentUserDomainService,
        private MagicBasePermissionDomainService $permissionDomainService,
        private MagicBaseTableRepository $repository,
    ) {
    }

    public function buildActorContext(MagicUserAuthorization $authorization): ActorContext
    {
        $dataIsolation = DataIsolation::simpleMake($authorization->getOrganizationCode(), $authorization->getId());
        $departmentIds = $this->departmentUserDomainService->getDepartmentIdsByUserId($dataIsolation, $authorization->getId(), true);
        return new ActorContext($authorization->getId(), $authorization->getOrganizationCode(), $departmentIds);
    }

    public function assertProjectManager(MagicUserAuthorization $authorization, int $projectId, ActorContext $actor): void
    {
        foreach ($this->repository->listProjectAdmins($authorization->getOrganizationCode(), $projectId) as $entry) {
            if ($this->permissionDomainService->matchSubject($entry, $actor)) {
                return;
            }
        }

        $this->forbidden('无项目管理权限');
    }

    public function assertTableManager(MagicUserAuthorization $authorization, int $projectId, int $tableId, ActorContext $actor): void
    {
        if ($this->permissionDomainService->isManager(
            $actor,
            $this->repository->listProjectAdmins($authorization->getOrganizationCode(), $projectId),
            $this->repository->listTableAdmins($authorization->getOrganizationCode(), $tableId),
            $this->repository->listTablePermissions($authorization->getOrganizationCode(), $tableId),
        )) {
            return;
        }

        $this->forbidden('无表管理权限');
    }

    /**
     * @param array{subject_type?: string, subject_id?: null|int|string} $payload
     */
    public function normalizeSubjectPayload(array $payload, bool $allowAnonymous): MagicBasePermissionSubject
    {
        $subjectType = trim((string) ($payload['subject_type'] ?? ''));
        $subjectId = trim((string) ($payload['subject_id'] ?? ''));
        $allowed = $allowAnonymous ? MagicBaseConst::SUBJECT_TYPES : MagicBaseConst::MANAGEABLE_SUBJECT_TYPES;
        if (! in_array($subjectType, $allowed, true)) {
            $this->invalid('subject_type');
        }
        if ($subjectType !== MagicBaseConst::SUBJECT_ANONYMOUS && $subjectId === '') {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => 'subject_id']);
        }

        return new MagicBasePermissionSubject($subjectType, $subjectId);
    }

    private function invalid(string $label): void
    {
        ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $label]);
    }

    private function forbidden(string $label): void
    {
        ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $label]);
    }
}
