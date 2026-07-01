<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\AppMenu\Repository\Facade;

use App\Domain\AppMenu\Entity\AppMenuEntity;
use App\Infrastructure\Core\ValueObject\Page;

interface AppMenuRepositoryInterface
{
    public function getById(int $id): ?AppMenuEntity;

    public function getByIdForOrganization(int $id, string $organizationCode, bool $isOfficialOrganization): ?AppMenuEntity;

    public function getByPath(string $appPath): ?AppMenuEntity;

    /**
     * @param array{name?: string, display_scope?: int} $filters
     * @return array{total: int, list: array<AppMenuEntity>}
     */
    public function queries(array $filters, Page $page): array;

    /**
     * @param array{name?: string, display_scope?: int, source_type?: int, status?: int} $filters
     * @return array{total: int, list: array<AppMenuEntity>}
     */
    public function queriesForOrganization(string $organizationCode, bool $isOfficialOrganization, array $filters, Page $page): array;

    public function save(AppMenuEntity $entity): AppMenuEntity;

    public function delete(int $id): bool;

    public function saveOfficialOrganizationOverride(int $appMenuId, string $organizationCode, int $status, int $sortOrder, string $creatorId): void;

    /**
     * @param array<int> $displayScopes
     * @return array<AppMenuEntity>
     */
    public function getAllEnabled(array $displayScopes): array;

    /**
     * @param array<int> $displayScopes
     * @return array<AppMenuEntity>
     */
    public function getAllEnabledForOrganization(string $organizationCode, array $displayScopes): array;
}
