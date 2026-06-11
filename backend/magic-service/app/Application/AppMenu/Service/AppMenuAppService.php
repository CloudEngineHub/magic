<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\AppMenu\Service;

use App\Application\Kernel\AbstractKernelAppService;
use App\Domain\AppMenu\Entity\AppMenuEntity;
use App\Domain\AppMenu\Service\AppMenuDomainService;
use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityConfig;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityType;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use RuntimeException;

/**
 * 应用菜单应用服务。
 *
 * AppMenu 领域负责菜单本体、官方菜单组织覆盖、自建菜单归属等规则；
 * ResourceVisibility 领域负责“某个自建菜单入口对哪些成员/部门可见”。
 * 这里作为应用层编排两个领域，避免在菜单领域里重复实现一套成员/部门可见性逻辑。
 */
class AppMenuAppService extends AbstractKernelAppService
{
    public function __construct(
        private readonly AppMenuDomainService $appMenuDomainService,
        private readonly ResourceVisibilityDomainService $resourceVisibilityDomainService,
    ) {
    }

    /**
     * @param array{name?: string, display_scope?: int} $filters
     * @return array{total: int, list: array<AppMenuEntity>}
     */
    public function queries(MagicUserAuthorization $authorization, array $filters, Page $page): array
    {
        $result = $this->appMenuDomainService->queriesForOrganization(
            $authorization->getOrganizationCode(),
            $this->isOfficialOrganization($authorization),
            $filters,
            $page
        );

        $this->attachVisibilityConfigs($authorization, $result['list']);

        return $result;
    }

    public function show(MagicUserAuthorization $authorization, int $id): AppMenuEntity
    {
        $entity = $this->appMenuDomainService->getByIdForOrganization(
            $id,
            $authorization->getOrganizationCode(),
            $this->isOfficialOrganization($authorization)
        );
        if (! $entity) {
            throw new RuntimeException('App menu not found: ' . $id);
        }

        $this->attachVisibilityConfigs($authorization, [$entity]);

        return $entity;
    }

    public function save(MagicUserAuthorization $authorization, AppMenuEntity $entity, ?VisibilityConfig $visibilityConfig = null): AppMenuEntity
    {
        // 菜单本体保存由 AppMenu 领域处理：官方组织保存官方菜单，非官方组织保存自建菜单或官方菜单覆盖。
        $savedEntity = $this->appMenuDomainService->save(
            $entity,
            $authorization->getId(),
            $authorization->getOrganizationCode(),
            $this->isOfficialOrganization($authorization)
        );

        // 只有组织自建菜单才支持指定成员/部门可见；官方菜单对非官方组织只支持显示/隐藏/排序覆盖。
        if ($savedEntity->isOrganization()) {
            $this->saveMenuVisibilityConfig(
                $authorization,
                (string) $savedEntity->getId(),
                $visibilityConfig ?? $this->createAllVisibleConfig()
            );
        }

        $this->attachVisibilityConfigs($authorization, [$savedEntity]);

        return $savedEntity;
    }

    public function delete(MagicUserAuthorization $authorization, int $id): bool
    {
        // 先读取当前组织视角下的菜单，用于判断删除成功后是否需要清理入口可见性配置。
        $entity = $this->appMenuDomainService->getByIdForOrganization(
            $id,
            $authorization->getOrganizationCode(),
            $this->isOfficialOrganization($authorization)
        );

        $deleted = $this->appMenuDomainService->delete(
            $id,
            $authorization->getOrganizationCode(),
            $this->isOfficialOrganization($authorization)
        );

        // 自建菜单删除后，可见性配置已经没有业务含义，需要同步清空。
        if ($deleted && $entity?->isOrganization()) {
            $this->resourceVisibilityDomainService->batchSaveResourceVisibility(
                $this->createPermissionDataIsolationFromAuthorization($authorization),
                ResourceType::APPLICATION_MENU,
                (string) $id,
                []
            );
        }

        return $deleted;
    }

    public function updateStatus(MagicUserAuthorization $authorization, int $id, int $status): AppMenuEntity
    {
        return $this->appMenuDomainService->updateStatus(
            $id,
            $status,
            $authorization->getOrganizationCode(),
            $this->isOfficialOrganization($authorization),
            $authorization->getId()
        );
    }

    /**
     * @param array<int> $displayScopes
     * @return array<AppMenuEntity>
     */
    public function getAllEnabled(array $displayScopes): array
    {
        return $this->appMenuDomainService->getAllEnabled($displayScopes);
    }

    /**
     * @param array<int> $displayScopes
     * @return array<AppMenuEntity>
     */
    public function getAllVisibleEnabled(MagicUserAuthorization $authorization, array $displayScopes): array
    {
        // 用户侧左侧入口需要按当前组织计算官方菜单覆盖和自建菜单，再按当前用户过滤可见性。
        $menus = $this->appMenuDomainService->getAllEnabledForOrganization(
            $authorization->getOrganizationCode(),
            $displayScopes
        );

        return $this->filterVisibleMenus($authorization, $menus);
    }

    /**
     * @param array<AppMenuEntity> $menus
     */
    private function attachVisibilityConfigs(MagicUserAuthorization $authorization, array $menus): void
    {
        $dataIsolation = $this->createPermissionDataIsolationFromAuthorization($authorization);

        foreach ($menus as $menu) {
            // 官方菜单没有成员/部门可见性配置；非官方组织对官方菜单的差异只来自 override 表。
            if ($menu->isOfficial() || ! $menu->getId()) {
                $menu->setVisibilityConfig($this->createAllVisibleConfig());
                continue;
            }

            $menu->setVisibilityConfig($this->resourceVisibilityDomainService->getVisibilityConfig(
                $dataIsolation,
                ResourceType::APPLICATION_MENU,
                (string) $menu->getId()
            ));
        }
    }

    /**
     * @param array<AppMenuEntity> $menus
     * @return array<AppMenuEntity>
     */
    private function filterVisibleMenus(MagicUserAuthorization $authorization, array $menus): array
    {
        $dataIsolation = $this->createPermissionDataIsolationFromAuthorization($authorization);
        $specificResourceIds = [];
        $visibilityByMenuId = [];

        // 先收集需要精确匹配的自建菜单，避免对每个菜单逐条做用户命中查询。
        foreach ($menus as $menu) {
            if ($menu->isOfficial() || ! $menu->getId()) {
                continue;
            }

            $resourceCode = (string) $menu->getId();
            $visibilityConfig = $this->resourceVisibilityDomainService->getVisibilityConfig(
                $dataIsolation,
                ResourceType::APPLICATION_MENU,
                $resourceCode
            );
            $visibilityByMenuId[$resourceCode] = $visibilityConfig;

            if ($visibilityConfig->getVisibilityType() === VisibilityType::SPECIFIC) {
                $specificResourceIds[] = $resourceCode;
            }
        }

        $accessibleSpecificResourceIds = $specificResourceIds === []
            ? []
            : $this->resourceVisibilityDomainService->getUserAccessibleResourceCodes(
                $dataIsolation,
                $authorization->getId(),
                ResourceType::APPLICATION_MENU,
                $specificResourceIds
            );

        $accessibleSpecificResourceIds = array_flip($accessibleSpecificResourceIds);

        // NONE/ALL 直接可见；SPECIFIC 必须命中当前用户或其所在部门。
        return array_values(array_filter($menus, static function (AppMenuEntity $menu) use ($visibilityByMenuId, $accessibleSpecificResourceIds): bool {
            if ($menu->isOfficial() || ! $menu->getId()) {
                return true;
            }

            $resourceCode = (string) $menu->getId();
            $visibilityConfig = $visibilityByMenuId[$resourceCode] ?? null;
            if ($visibilityConfig === null) {
                return true;
            }

            return match ($visibilityConfig->getVisibilityType()) {
                VisibilityType::NONE,
                VisibilityType::ALL => true,
                VisibilityType::SPECIFIC => isset($accessibleSpecificResourceIds[$resourceCode]),
            };
        }));
    }

    private function saveMenuVisibilityConfig(MagicUserAuthorization $authorization, string $resourceCode, VisibilityConfig $visibilityConfig): void
    {
        $this->resourceVisibilityDomainService->saveVisibilityConfig(
            $this->createPermissionDataIsolationFromAuthorization($authorization),
            ResourceType::APPLICATION_MENU,
            $resourceCode,
            $visibilityConfig
        );
    }

    private function createAllVisibleConfig(): VisibilityConfig
    {
        $visibilityConfig = new VisibilityConfig();
        $visibilityConfig->setVisibilityType(VisibilityType::ALL);

        return $visibilityConfig;
    }

    private function createPermissionDataIsolationFromAuthorization(MagicUserAuthorization $authorization): PermissionDataIsolation
    {
        return PermissionDataIsolation::create($authorization->getOrganizationCode(), $authorization->getId());
    }

    private function isOfficialOrganization(MagicUserAuthorization $authorization): bool
    {
        return OfficialOrganizationUtil::isOfficialOrganization($authorization->getOrganizationCode());
    }
}
