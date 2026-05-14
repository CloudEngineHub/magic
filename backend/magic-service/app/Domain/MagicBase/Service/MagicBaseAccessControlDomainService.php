<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseTableAccessContext;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MemberRole;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectMemberDomainService;
use LogicException;

readonly class MagicBaseAccessControlDomainService
{
    public function __construct(
        private MagicBaseTableRepository $repository,
        private MagicBaseAdminDomainService $adminDomainService,
        private MagicBaseQueryDomainService $queryDomainService,
        private ProjectDomainService $projectDomainService,
        private ProjectMemberDomainService $projectMemberDomainService,
        private MagicDepartmentUserDomainService $departmentUserDomainService,
    ) {
    }

    public function requireReadableTable(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $this->requireReadableProject($authorization, $projectId);
        return $this->loadTableContext($authorization, $projectId, $tableId);
    }

    public function requireInsertableTable(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        return $this->requireWritableTable($authorization, $projectId, $tableId);
    }

    public function requireWritableTable(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $this->requireWritableProject($authorization, $projectId);
        return $this->loadTableContext($authorization, $projectId, $tableId);
    }

    public function requireTableManager(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $this->requireManageableProject($authorization, $projectId);
        return $this->loadTableContext($authorization, $projectId, $tableId);
    }

    public function requireProjectManager(MagicUserAuthorization $authorization, int $projectId): ActorContext
    {
        $this->requireManageableProject($authorization, $projectId);
        return $this->adminDomainService->buildActorContext($authorization);
    }

    public function requireReadableProject(MagicUserAuthorization $authorization, int $projectId): void
    {
        $this->requireProjectRole($authorization, $projectId, MemberRole::VIEWER, '无项目访问权限');
    }

    public function requireWritableProject(MagicUserAuthorization $authorization, int $projectId): void
    {
        $this->requireProjectRole($authorization, $projectId, MemberRole::EDITOR, '无项目编辑权限');
    }

    public function requireManageableProject(MagicUserAuthorization $authorization, int $projectId): void
    {
        $this->requireProjectRole($authorization, $projectId, MemberRole::MANAGE, '无项目管理权限');
    }

    public function requireReadableRow(MagicUserAuthorization $authorization, MagicBaseTableAccessContext $context, int $recordId): MagicBaseRowEntity
    {
        return $this->queryDomainService->getRowOrFail($authorization, $context->getTableId(), $recordId);
    }

    public function requireEditableRow(MagicUserAuthorization $authorization, MagicBaseTableAccessContext $context, int $recordId): MagicBaseRowEntity
    {
        return $this->queryDomainService->getRowOrFail($authorization, $context->getTableId(), $recordId);
    }

    public function requireDeletableRow(MagicUserAuthorization $authorization, MagicBaseTableAccessContext $context, int $recordId): MagicBaseRowEntity
    {
        return $this->queryDomainService->getRowOrFail($authorization, $context->getTableId(), $recordId);
    }

    /**
     * @param list<string> $fieldKeys dynamic row field keys to be edited
     */
    public function assertEditableColumns(MagicBaseTableAccessContext $context, MagicBaseRowEntity $row, array $fieldKeys): void
    {
        unset($context, $row, $fieldKeys);
    }

    public function filterReadableRows(MagicBaseTableAccessContext $context, MagicBaseEntityCollection $rows): MagicBaseEntityCollection
    {
        unset($context);
        return $rows;
    }

    public function loadTableContext(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $actor = $this->adminDomainService->buildActorContext($authorization);
        $table = $this->getTableOrFail($authorization, $projectId, $tableId);
        $table = $this->queryDomainService->enrichTableScope($table);
        $access = $this->queryDomainService->loadAccessContext($authorization, $projectId, $tableId, $actor);

        return new MagicBaseTableAccessContext($projectId, $tableId, $actor, $table, $access);
    }

    private function getTableOrFail(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableEntity
    {
        $table = $this->repository->getTable($authorization->getOrganizationCode(), $projectId, $tableId);
        if ($table === null) {
            $this->invalid('数据表');
        }
        return $table;
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::resourceNotFound($label);
    }

    private function forbidden(string $label): void
    {
        MagicBaseExceptionBuilder::accessDenied($label);
    }

    private function requireProjectRole(
        MagicUserAuthorization $authorization,
        int $projectId,
        MemberRole $requiredRole,
        string $deniedMessage,
    ): ProjectEntity {
        $project = $this->getProjectOrFail($projectId);
        if (! $this->isSameOrganization($authorization, $project)) {
            $this->forbidden($deniedMessage);
        }
        if ($this->isProjectOwner($authorization, $project)) {
            return $project;
        }

        $member = $this->projectMemberDomainService->getMemberByProjectAndUser($projectId, $authorization->getId());
        if ($member !== null && $member->getRole()->isHigherOrEqualThan($requiredRole)) {
            return $project;
        }

        $dataIsolation = DataIsolation::simpleMake($authorization->getOrganizationCode(), $authorization->getId());
        $departmentIds = $this->departmentUserDomainService->getDepartmentIdsByUserId($dataIsolation, $authorization->getId(), true);
        foreach ($this->projectMemberDomainService->getMembersByProjectAndDepartmentIds($projectId, $departmentIds) as $departmentMember) {
            if ($departmentMember->getRole()->isHigherOrEqualThan($requiredRole)) {
                return $project;
            }
        }

        $this->forbidden($deniedMessage);
        throw new LogicException('Unreachable');
    }

    private function getProjectOrFail(int $projectId): ProjectEntity
    {
        $projects = $this->projectDomainService->getProjectsByIds([$projectId]);
        foreach ($projects as $project) {
            if ($project instanceof ProjectEntity && $project->getId() === $projectId) {
                return $project;
            }
        }

        MagicBaseExceptionBuilder::resourceNotFound('项目');
        throw new LogicException('Unreachable');
    }

    private function isSameOrganization(MagicUserAuthorization $authorization, ProjectEntity $project): bool
    {
        return $project->getUserOrganizationCode() === ''
            || $project->getUserOrganizationCode() === $authorization->getOrganizationCode();
    }

    private function isProjectOwner(MagicUserAuthorization $authorization, ProjectEntity $project): bool
    {
        return in_array($authorization->getId(), [$project->getUserId(), $project->getCreatedUid()], true);
    }
}
