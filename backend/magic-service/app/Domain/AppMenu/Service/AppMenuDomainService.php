<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\AppMenu\Service;

use App\Domain\AppMenu\Entity\AppMenuEntity;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuSourceType;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use App\Domain\AppMenu\Repository\Facade\AppMenuRepositoryInterface;
use App\ErrorCode\AppMenuErrorCode;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;

readonly class AppMenuDomainService
{
    public function __construct(
        private AppMenuRepositoryInterface $appMenuRepository
    ) {
    }

    public function getById(int $id): ?AppMenuEntity
    {
        return $this->appMenuRepository->getById($id);
    }

    public function getByIdForOrganization(int $id, string $organizationCode, bool $isOfficialOrganization): ?AppMenuEntity
    {
        return $this->appMenuRepository->getByIdForOrganization($id, $organizationCode, $isOfficialOrganization);
    }

    public function getByPath(string $appPath): ?AppMenuEntity
    {
        return $this->appMenuRepository->getByPath($appPath);
    }

    /**
     * @param array{name?: string, display_scope?: int} $filters
     * @return array{total: int, list: array<AppMenuEntity>}
     */
    public function queries(array $filters, Page $page): array
    {
        return $this->appMenuRepository->queries($filters, $page);
    }

    /**
     * @param array{name?: string, display_scope?: int, source_type?: int, status?: int} $filters
     * @return array{total: int, list: array<AppMenuEntity>}
     */
    public function queriesForOrganization(string $organizationCode, bool $isOfficialOrganization, array $filters, Page $page): array
    {
        return $this->appMenuRepository->queriesForOrganization($organizationCode, $isOfficialOrganization, $filters, $page);
    }

    public function save(AppMenuEntity $savingEntity, string $currentUserId, string $organizationCode = '', bool $isOfficialOrganization = true): AppMenuEntity
    {
        if ($savingEntity->shouldCreate()) {
            $entity = clone $savingEntity;
            $entity->setCreatorId($currentUserId);
            $entity->setOrganizationCode($organizationCode);
            $entity->setSourceType($isOfficialOrganization ? AppMenuSourceType::Official->value : AppMenuSourceType::Organization->value);
            $entity->prepareForCreation();
        } else {
            $id = $savingEntity->getId();
            if ($id === null) {
                ExceptionBuilder::throw(AppMenuErrorCode::IdRequiredForUpdate, 'app_menu.id_required_for_update');
            }

            $entity = $organizationCode === ''
                ? $this->appMenuRepository->getById($id)
                : $this->appMenuRepository->getByIdForOrganization($id, $organizationCode, $isOfficialOrganization);
            if (! $entity) {
                ExceptionBuilder::throw(AppMenuErrorCode::NotFound, 'app_menu.not_found');
            }

            if (! $isOfficialOrganization && $entity->isOfficial()) {
                $this->saveOfficialOrganizationOverride(
                    $entity,
                    $organizationCode,
                    $currentUserId,
                    $savingEntity->getStatus(),
                    $savingEntity->getSortOrder()
                );

                return $this->appMenuRepository->getByIdForOrganization($id, $organizationCode, false) ?? $entity;
            }

            if (! $isOfficialOrganization && $entity->getOrganizationCode() !== $organizationCode) {
                ExceptionBuilder::throw(AppMenuErrorCode::NotFound, 'app_menu.not_found');
            }

            $savingEntity->prepareForModification($entity);
        }

        return $this->appMenuRepository->save($entity);
    }

    public function delete(int $id, string $organizationCode = '', bool $isOfficialOrganization = true): bool
    {
        $entity = $organizationCode === ''
            ? $this->appMenuRepository->getById($id)
            : $this->appMenuRepository->getByIdForOrganization($id, $organizationCode, $isOfficialOrganization);
        if (! $entity) {
            ExceptionBuilder::throw(AppMenuErrorCode::NotFound, 'app_menu.not_found');
        }

        if (! $isOfficialOrganization && (! $entity->isOrganization() || $entity->getOrganizationCode() !== $organizationCode)) {
            ExceptionBuilder::throw(AppMenuErrorCode::NotFound, 'app_menu.not_found');
        }

        return $this->appMenuRepository->delete($id);
    }

    public function updateStatus(int $id, int $status, string $organizationCode = '', bool $isOfficialOrganization = true, string $currentUserId = ''): AppMenuEntity
    {
        $entity = $organizationCode === ''
            ? $this->appMenuRepository->getById($id)
            : $this->appMenuRepository->getByIdForOrganization($id, $organizationCode, $isOfficialOrganization);
        if (! $entity) {
            ExceptionBuilder::throw(AppMenuErrorCode::NotFound, 'app_menu.not_found');
        }

        if (! $isOfficialOrganization && $entity->isOfficial()) {
            $this->saveOfficialOrganizationOverride(
                $entity,
                $organizationCode,
                $currentUserId,
                $status,
                $entity->getEffectiveSortOrder()
            );

            return $this->appMenuRepository->getByIdForOrganization($id, $organizationCode, false) ?? $entity;
        }

        if (! $isOfficialOrganization && $entity->getOrganizationCode() !== $organizationCode) {
            ExceptionBuilder::throw(AppMenuErrorCode::NotFound, 'app_menu.not_found');
        }

        $entity->setStatus($status);

        return $this->appMenuRepository->save($entity);
    }

    /**
     * @param array<int> $displayScopes
     * @return array<AppMenuEntity>
     */
    public function getAllEnabled(array $displayScopes): array
    {
        return $this->appMenuRepository->getAllEnabled($displayScopes);
    }

    /**
     * @param array<int> $displayScopes
     * @return array<AppMenuEntity>
     */
    public function getAllEnabledForOrganization(string $organizationCode, array $displayScopes): array
    {
        return $this->appMenuRepository->getAllEnabledForOrganization($organizationCode, $displayScopes);
    }

    private function saveOfficialOrganizationOverride(
        AppMenuEntity $officialMenu,
        string $organizationCode,
        string $currentUserId,
        int $status,
        int $sortOrder
    ): void {
        if (! $officialMenu->isOfficial()) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => '官方菜单']);
        }

        $this->appMenuRepository->saveOfficialOrganizationOverride(
            (int) $officialMenu->getId(),
            $organizationCode,
            AppMenuStatus::make($status)->value,
            $sortOrder,
            $currentUserId
        );
    }
}
