<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\AppMenu;

use App\Domain\AppMenu\Entity\AppMenuEntity;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuSourceType;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use App\Domain\AppMenu\Repository\Persistence\Model\AppMenuModel;
use App\Domain\AppMenu\Repository\Persistence\Model\AppMenuOrganizationOverrideModel;
use App\Domain\AppMenu\Service\AppMenuDomainService;
use App\Infrastructure\Core\ValueObject\Page;
use HyperfTest\HttpTestCase;

/**
 * @internal
 */
class AppMenuOrganizationScopeTest extends HttpTestCase
{
    private AppMenuDomainService $domainService;

    private string $organizationCode;

    private string $anotherOrganizationCode;

    private int $officialMenuId;

    private int $organizationMenuId;

    private int $anotherOrganizationMenuId;

    private string $organizationMenuPath;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = substr(str_replace('.', '', uniqid('', true)), -6);
        $this->organizationCode = 'app_menu_org_' . $suffix;
        $this->anotherOrganizationCode = 'app_menu_another_' . $suffix;
        $this->domainService = $this->getContainer()->get(AppMenuDomainService::class);

        $this->officialMenuId = (int) AppMenuModel::query()->insertGetId($this->makeMenuAttributes(
            organizationCode: 'DT001',
            sourceType: AppMenuSourceType::Official->value,
            name: 'O' . $suffix,
            sortOrder: 1000,
        ));
        $this->organizationMenuId = (int) AppMenuModel::query()->insertGetId($this->makeMenuAttributes(
            organizationCode: $this->organizationCode,
            sourceType: AppMenuSourceType::Organization->value,
            name: 'A' . $suffix,
            sortOrder: 900,
        ));
        $this->organizationMenuPath = '/app-menu-test/' . md5('A' . $suffix);
        $this->anotherOrganizationMenuId = (int) AppMenuModel::query()->insertGetId($this->makeMenuAttributes(
            organizationCode: $this->anotherOrganizationCode,
            sourceType: AppMenuSourceType::Organization->value,
            name: 'B' . $suffix,
            sortOrder: 800,
        ));
    }

    protected function tearDown(): void
    {
        AppMenuOrganizationOverrideModel::query()
            ->whereIn('app_menu_id', [$this->officialMenuId, $this->organizationMenuId, $this->anotherOrganizationMenuId])
            ->delete();
        AppMenuModel::query()
            ->whereIn('id', [$this->officialMenuId, $this->organizationMenuId, $this->anotherOrganizationMenuId])
            ->forceDelete();

        parent::tearDown();
    }

    public function testOrganizationQueriesMergeOfficialAndOwnMenusOnly(): void
    {
        $result = $this->domainService->queriesForOrganization(
            $this->organizationCode,
            false,
            [],
            Page::createNoPage()
        );

        $ids = array_map(static fn ($entity): int => (int) $entity->getId(), $result['list']);

        self::assertContains($this->officialMenuId, $ids);
        self::assertContains($this->organizationMenuId, $ids);
        self::assertNotContains($this->anotherOrganizationMenuId, $ids);
    }

    public function testOrganizationEnabledMenusRespectOfficialOverride(): void
    {
        AppMenuOrganizationOverrideModel::query()->create([
            'app_menu_id' => $this->officialMenuId,
            'organization_code' => $this->organizationCode,
            'sort_order' => 1000,
            'status' => AppMenuStatus::Disabled->value,
            'creator_id' => 'app_menu_test',
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        $menus = $this->domainService->getAllEnabledForOrganization($this->organizationCode, [2]);
        $ids = array_map(static fn ($entity): int => (int) $entity->getId(), $menus);

        self::assertNotContains($this->officialMenuId, $ids);
        self::assertContains($this->organizationMenuId, $ids);
        self::assertNotContains($this->anotherOrganizationMenuId, $ids);
    }

    public function testDisabledOfficialMenuIsHiddenFromOrganizationEvenWithEnabledOverride(): void
    {
        AppMenuModel::query()
            ->where('id', $this->officialMenuId)
            ->update(['status' => AppMenuStatus::Disabled->value]);
        AppMenuOrganizationOverrideModel::query()->create([
            'app_menu_id' => $this->officialMenuId,
            'organization_code' => $this->organizationCode,
            'sort_order' => 1000,
            'status' => AppMenuStatus::Enabled->value,
            'creator_id' => 'app_menu_test',
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        $result = $this->domainService->queriesForOrganization(
            $this->organizationCode,
            false,
            [],
            Page::createNoPage()
        );
        $queryIds = array_map(static fn ($entity): int => (int) $entity->getId(), $result['list']);

        $menus = $this->domainService->getAllEnabledForOrganization($this->organizationCode, [2]);
        $enabledIds = array_map(static fn ($entity): int => (int) $entity->getId(), $menus);

        self::assertNotContains($this->officialMenuId, $queryIds);
        self::assertNotContains($this->officialMenuId, $enabledIds);
        self::assertNull($this->domainService->getByIdForOrganization($this->officialMenuId, $this->organizationCode, false));
    }

    public function testOrganizationQueriesCanSearchByPath(): void
    {
        $result = $this->domainService->queriesForOrganization(
            $this->organizationCode,
            false,
            ['name' => $this->organizationMenuPath],
            Page::createNoPage()
        );

        $ids = array_map(static fn ($entity): int => (int) $entity->getId(), $result['list']);

        self::assertSame([$this->organizationMenuId], $ids);
    }

    public function testLegacyEnabledMenusOnlyReturnOfficialMenus(): void
    {
        $menus = $this->domainService->getAllEnabled([2]);
        $ids = array_map(static fn ($entity): int => (int) $entity->getId(), $menus);

        self::assertContains($this->officialMenuId, $ids);
        self::assertNotContains($this->organizationMenuId, $ids);
        self::assertNotContains($this->anotherOrganizationMenuId, $ids);
    }

    public function testOrganizationCanSaveOfficialOverrideWithoutBaseFields(): void
    {
        $savingEntity = new AppMenuEntity();
        $savingEntity->setId($this->officialMenuId);
        $savingEntity->setStatus(AppMenuStatus::Disabled->value);
        $savingEntity->setSortOrder(1234);

        $saved = $this->domainService->save($savingEntity, 'app_menu_test_user', $this->organizationCode, false);

        self::assertSame(AppMenuStatus::Disabled->value, $saved->getEffectiveStatus());
        self::assertSame(1234, $saved->getEffectiveSortOrder());
    }

    private function makeMenuAttributes(
        string $organizationCode,
        int $sourceType,
        string $name,
        int $sortOrder,
    ): array {
        $now = date('Y-m-d H:i:s');

        return [
            'organization_code' => $organizationCode,
            'source_type' => $sourceType,
            'name_i18n' => json_encode(['zh_CN' => $name, 'en_US' => $name], JSON_THROW_ON_ERROR),
            'icon' => 'Menu',
            'icon_url' => '',
            'icon_type' => 1,
            'path' => '/app-menu-test/' . md5($name),
            'open_method' => 1,
            'sort_order' => $sortOrder,
            'display_scope' => 2,
            'status' => AppMenuStatus::Enabled->value,
            'creator_id' => 'app_menu_test',
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }
}
