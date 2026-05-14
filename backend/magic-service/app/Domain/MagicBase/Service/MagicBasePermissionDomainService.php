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
            'read_scope'
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
            'insert_scope'
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
            || $this->hasMatchingBooleanPermission($rowPermissions, $actor, 'can_read')
            || $this->matchScope($this->getRowScope($table, 'read_scope'), $actor, $document);
    }

    public function canEditRow(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseTableEntity $table,
        iterable $rowPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($rowPermissions, $actor, 'can_edit')
            || $this->matchScope($this->getRowScope($table, 'edit_scope'), $actor, $document);
    }

    public function canDeleteRow(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseTableEntity $table,
        iterable $rowPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($rowPermissions, $actor, 'can_delete')
            || $this->matchScope($this->getRowScope($table, 'delete_scope'), $actor, $document);
    }

    public function canReadColumn(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseColumnEntity $column,
        iterable $columnPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($columnPermissions, $actor, 'can_read')
            || $this->matchScope($this->getColumnScope($column, 'read_scope'), $actor, $document);
    }

    public function canEditColumn(
        ActorContext $actor,
        MagicBaseRowEntity $document,
        MagicBaseColumnEntity $column,
        iterable $columnPermissions,
        bool $isManager,
    ): bool {
        return $isManager
            || $this->hasMatchingBooleanPermission($columnPermissions, $actor, 'can_edit')
            || $this->matchScope($this->getColumnScope($column, 'edit_scope'), $actor, $document);
    }

    private function canAccessTableByLevel(
        ActorContext $actor,
        MagicBaseTableEntity $table,
        iterable $tablePermissions,
        bool $isManager,
        string $requiredLevel,
        string $scopeField,
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
            $this->getTableScope($table, $scopeField),
            $actor,
            $table
        );
    }

    private function hasMatchingBooleanPermission(iterable $entries, ActorContext $actor, string $field): bool
    {
        foreach ($entries as $entry) {
            if ($this->matchSubject($entry, $actor) && $this->getBooleanPermission($entry, $field)) {
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

    private function getBooleanPermission(mixed $entry, string $field): bool
    {
        if ($entry instanceof MagicBaseColumnPermissionEntity) {
            return match ($field) {
                'can_read' => $entry->getCanRead(),
                'can_edit' => $entry->getCanEdit(),
                default => false,
            };
        }

        if ($entry instanceof MagicBaseRowPermissionEntity) {
            return match ($field) {
                'can_read' => $entry->getCanRead(),
                'can_edit' => $entry->getCanEdit(),
                'can_delete' => $entry->getCanDelete(),
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

    private function getTableScope(MagicBaseTableEntity $table, string $scopeField): string
    {
        $permissions = $table->getDynamicPermissions();

        return (string) ($permissions['table'][$scopeField] ?? MagicBaseConst::SCOPE_PUBLIC);
    }

    private function getRowScope(MagicBaseTableEntity $table, string $scopeField): string
    {
        $permissions = $table->getDynamicPermissions();

        return (string) ($permissions['row'][$scopeField] ?? MagicBaseConst::SCOPE_PUBLIC);
    }

    private function getColumnScope(MagicBaseColumnEntity $column, string $scopeField): string
    {
        $permission = $column->getDynamicPermission();

        return (string) ($permission[$scopeField] ?? MagicBaseConst::SCOPE_PUBLIC);
    }
}
