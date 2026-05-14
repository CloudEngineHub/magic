<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseColumnPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseProjectAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\MagicBaseTablePermissionEntity;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBasePermissionAction;

class MagicBasePermissionDomainService
{
    public function matchScope(string $scope, ActorContext $actor, MagicBaseRowEntity|MagicBaseTableEntity $document): bool
    {
        return match ($scope) {
            MagicBaseConst::SCOPE_PUBLIC => true,
            MagicBaseConst::SCOPE_PRIVATE_USER => $actor->getUserId() !== '' && $actor->getUserId() === $this->getCreatedBy($document),
            MagicBaseConst::SCOPE_PRIVATE_DEPARTMENT => $this->hasDepartmentIntersection(
                $actor->getDepartmentIds(),
                $this->getOwnerDepartmentIds($document)
            ),
            MagicBaseConst::SCOPE_PRIVATE_ORG => $actor->getOrganizationCode() !== '' && $actor->getOrganizationCode() === $this->getOrganizationCode($document),
            default => false,
        };
    }

    public function matchSubject(mixed $entry, ActorContext $actor): bool
    {
        $subjectType = $this->getSubjectType($entry);
        $subjectId = $this->getSubjectId($entry);

        return match ($subjectType) {
            MagicBaseConst::SUBJECT_ANONYMOUS => true,
            MagicBaseConst::SUBJECT_USER => $subjectId !== '' && $subjectId === $actor->getUserId(),
            MagicBaseConst::SUBJECT_DEPARTMENT => in_array($subjectId, $actor->getDepartmentIds(), true),
            MagicBaseConst::SUBJECT_ORGANIZATION,
            MagicBaseConst::SUBJECT_ORGANIZATION_CODE => $subjectId !== '' && $subjectId === $actor->getOrganizationCode(),
            default => false,
        };
    }

    public function isManager(
        ActorContext $actor,
        iterable $projectAdmins,
        iterable $tableAdmins,
        iterable $tablePermissions,
    ): bool {
        foreach ($projectAdmins as $entry) {
            if ($this->matchSubject($entry, $actor)) {
                return true;
            }
        }

        foreach ($tableAdmins as $entry) {
            if ($this->matchSubject($entry, $actor)) {
                return true;
            }
        }

        foreach ($tablePermissions as $entry) {
            if (
                $this->matchSubject($entry, $actor)
                && $this->getPermissionLevel($entry) === MagicBaseConst::PERMISSION_MANAGE
            ) {
                return true;
            }
        }

        return false;
    }

    public function canReadTable(ActorContext $actor, MagicBaseTableEntity $table, iterable $tablePermissions, bool $isManager): bool
    {
        return $this->canAccessTableByLevel(
            $actor,
            $table,
            $tablePermissions,
            $isManager,
            MagicBaseConst::PERMISSION_READ,
            MagicBasePermissionAction::Read
        );
    }

    public function canInsertTable(ActorContext $actor, MagicBaseTableEntity $table, iterable $tablePermissions, bool $isManager): bool
    {
        return $this->canAccessTableByLevel(
            $actor,
            $table,
            $tablePermissions,
            $isManager,
            MagicBaseConst::PERMISSION_INSERT,
            MagicBasePermissionAction::Insert
        );
    }

    public function canReadRow(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseTableEntity $table,
        iterable $rowPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($rowPermissions, $actor, MagicBasePermissionAction::Read)
            || $this->matchScope($this->getRowScope($table, MagicBasePermissionAction::Read), $actor, $document);
    }

    public function canEditRow(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseTableEntity $table,
        iterable $rowPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($rowPermissions, $actor, MagicBasePermissionAction::Edit)
            || $this->matchScope($this->getRowScope($table, MagicBasePermissionAction::Edit), $actor, $document);
    }

    public function canDeleteRow(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseTableEntity $table,
        iterable $rowPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($rowPermissions, $actor, MagicBasePermissionAction::Delete)
            || $this->matchScope($this->getRowScope($table, MagicBasePermissionAction::Delete), $actor, $document);
    }

    public function canReadColumn(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseColumnEntity $column,
        iterable $columnPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($columnPermissions, $actor, MagicBasePermissionAction::Read)
            || $this->matchScope($this->getColumnScope($column, MagicBasePermissionAction::Read), $actor, $document);
    }

    public function canEditColumn(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseColumnEntity $column,
        iterable $columnPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($columnPermissions, $actor, MagicBasePermissionAction::Edit)
            || $this->matchScope($this->getColumnScope($column, MagicBasePermissionAction::Edit), $actor, $document);
    }

    private function canAccessTableByLevel(
        ActorContext $actor,
        MagicBaseTableEntity $table,
        iterable $tablePermissions,
        bool $isManager,
        string $requiredLevel,
        MagicBasePermissionAction $action,
    ): bool {
        if ($isManager) {
            return true;
        }

        foreach ($tablePermissions as $entry) {
            if (! $this->matchSubject($entry, $actor)) {
                continue;
            }

            $level = $this->getPermissionLevel($entry);
            if ($level === MagicBaseConst::PERMISSION_MANAGE || $level === $requiredLevel) {
                return true;
            }
        }

        return $this->matchScope(
            $this->getTableScope($table, $action),
            $actor,
            $table
        );
    }

    private function hasMatchingBooleanPermission(iterable $entries, ActorContext $actor, MagicBasePermissionAction $action): bool
    {
        foreach ($entries as $entry) {
            if ($this->matchSubject($entry, $actor) && $this->getBooleanPermission($entry, $action)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param string[] $actorDepartmentIds
     * @param string[] $ownerDepartmentIds
     */
    private function hasDepartmentIntersection(array $actorDepartmentIds, array $ownerDepartmentIds): bool
    {
        return array_intersect($actorDepartmentIds, $ownerDepartmentIds) !== [];
    }

    private function getCreatedBy(MagicBaseRowEntity|MagicBaseTableEntity $document): string
    {
        return $document->getCreatedBy();
    }

    private function getSubjectType(mixed $entry): string
    {
        if (
            $entry instanceof MagicBaseProjectAdminEntity
            || $entry instanceof MagicBaseTableAdminEntity
            || $entry instanceof MagicBaseTablePermissionEntity
            || $entry instanceof MagicBaseColumnPermissionEntity
            || $entry instanceof MagicBaseRowPermissionEntity
        ) {
            return $entry->getSubjectType();
        }

        return '';
    }

    private function getSubjectId(mixed $entry): string
    {
        if (
            $entry instanceof MagicBaseProjectAdminEntity
            || $entry instanceof MagicBaseTableAdminEntity
            || $entry instanceof MagicBaseTablePermissionEntity
            || $entry instanceof MagicBaseColumnPermissionEntity
            || $entry instanceof MagicBaseRowPermissionEntity
        ) {
            return $entry->getSubjectId();
        }

        return '';
    }

    private function getPermissionLevel(mixed $entry): string
    {
        if ($entry instanceof MagicBaseTablePermissionEntity) {
            return $entry->getPermissionLevel();
        }

        return '';
    }

    private function getBooleanPermission(mixed $entry, MagicBasePermissionAction $action): bool
    {
        if ($entry instanceof MagicBaseColumnPermissionEntity) {
            return match ($action) {
                MagicBasePermissionAction::Read => $entry->getCanRead(),
                MagicBasePermissionAction::Edit => $entry->getCanEdit(),
                default => false,
            };
        }

        if ($entry instanceof MagicBaseRowPermissionEntity) {
            return match ($action) {
                MagicBasePermissionAction::Read => $entry->getCanRead(),
                MagicBasePermissionAction::Edit => $entry->getCanEdit(),
                MagicBasePermissionAction::Delete => $entry->getCanDelete(),
                default => false,
            };
        }

        return false;
    }

    private function getOrganizationCode(MagicBaseRowEntity|MagicBaseTableEntity $document): string
    {
        return $document->getOrganizationCode();
    }

    /**
     * @return list<string>
     */
    private function getOwnerDepartmentIds(MagicBaseRowEntity|MagicBaseTableEntity $document): array
    {
        return $document->getOwnerDepartmentIds();
    }

    private function getTableScope(MagicBaseTableEntity $table, MagicBasePermissionAction $action): string
    {
        $permission = $table->getDynamicPermissions()->getTable();

        return match ($action) {
            MagicBasePermissionAction::Read => $permission->getReadScope(),
            MagicBasePermissionAction::Insert => $permission->getInsertScope(),
            default => MagicBaseConst::SCOPE_DISABLED,
        };
    }

    private function getRowScope(MagicBaseTableEntity $table, MagicBasePermissionAction $action): string
    {
        $permission = $table->getDynamicPermissions()->getRow();

        return match ($action) {
            MagicBasePermissionAction::Read => $permission->getReadScope(),
            MagicBasePermissionAction::Edit => $permission->getEditScope(),
            MagicBasePermissionAction::Delete => $permission->getDeleteScope(),
            default => MagicBaseConst::SCOPE_DISABLED,
        };
    }

    private function getColumnScope(MagicBaseColumnEntity $column, MagicBasePermissionAction $action): string
    {
        $permission = $column->getDynamicPermission();

        return match ($action) {
            MagicBasePermissionAction::Read => $permission->getReadScope(),
            MagicBasePermissionAction::Edit => $permission->getEditScope(),
            default => MagicBaseConst::SCOPE_DISABLED,
        };
    }
}
