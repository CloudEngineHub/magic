<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Permission;

use App\Domain\Permission\Entity\ResourceVisibilityEntity;
use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\PrincipalType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType;
use App\Domain\Permission\Repository\Facade\ResourceVisibilityRepositoryInterface;
use App\Domain\Permission\Repository\Persistence\Model\ResourceVisibilityModel;
use HyperfTest\HttpTestCase;

/**
 * @internal
 */
class ResourceVisibilityApplicationMenuTest extends HttpTestCase
{
    private ResourceVisibilityRepositoryInterface $repository;

    private string $organizationCode;

    private string $anotherOrganizationCode;

    private string $resourceCode;

    private string $principalId;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = uniqid('', true);
        $this->organizationCode = 'rv_menu_org_' . $suffix;
        $this->anotherOrganizationCode = 'rv_menu_another_org_' . $suffix;
        $this->resourceCode = 'rv_menu_code_' . $suffix;
        $this->principalId = 'rv_menu_user_' . $suffix;
        $this->repository = $this->getContainer()->get(ResourceVisibilityRepositoryInterface::class);

        $this->cleanUpTestData();
    }

    protected function tearDown(): void
    {
        $this->cleanUpTestData();

        parent::tearDown();
    }

    public function testListByPrincipalIdsOnlyReturnsCurrentOrganizationRecords(): void
    {
        $this->insertVisibility($this->organizationCode);
        $this->insertVisibility($this->anotherOrganizationCode);

        $entities = $this->repository->listByPrincipalIds(
            $this->createDataIsolation($this->organizationCode),
            [$this->principalId],
            ResourceType::APPLICATION_MENU
        );

        $this->assertCount(1, $entities);
        $this->assertSame($this->organizationCode, $entities[0]->getOrganizationCode());
        $this->assertSame($this->resourceCode, $entities[0]->getResourceCode());
    }

    public function testListByResourceOnlyReturnsCurrentOrganizationRecords(): void
    {
        $this->insertVisibility($this->organizationCode);
        $this->insertVisibility($this->anotherOrganizationCode);

        $entities = $this->repository->listByResource(
            $this->createDataIsolation($this->organizationCode),
            ResourceType::APPLICATION_MENU,
            $this->resourceCode
        );

        $this->assertCount(1, $entities);
        $this->assertSame($this->organizationCode, $entities[0]->getOrganizationCode());
        $this->assertSame($this->principalId, $entities[0]->getPrincipalId());
    }

    public function testDeleteByResourceCodeOnlyDeletesCurrentOrganizationRecords(): void
    {
        $this->insertVisibility($this->organizationCode);
        $this->insertVisibility($this->anotherOrganizationCode);

        $this->repository->deleteByResourceCode(
            $this->createDataIsolation($this->organizationCode),
            ResourceType::APPLICATION_MENU,
            $this->resourceCode
        );

        $remaining = ResourceVisibilityModel::query()
            ->where('resource_type', ResourceType::APPLICATION_MENU->value)
            ->where('resource_code', $this->resourceCode)
            ->get();

        $this->assertCount(1, $remaining);
        $this->assertSame($this->anotherOrganizationCode, $remaining[0]->organization_code);
    }

    private function insertVisibility(string $organizationCode): void
    {
        $entity = new ResourceVisibilityEntity();
        $entity->setOrganizationCode($organizationCode);
        $entity->setPrincipalType(PrincipalType::USER);
        $entity->setPrincipalId($this->principalId);
        $entity->setResourceType(ResourceType::APPLICATION_MENU);
        $entity->setResourceCode($this->resourceCode);
        $entity->setCreator('resource_visibility_test');
        $entity->setModifier('resource_visibility_test');
        $entity->prepareForCreation();

        $this->repository->batchInsert($this->createDataIsolation($organizationCode), [$entity]);
    }

    private function createDataIsolation(string $organizationCode): PermissionDataIsolation
    {
        return PermissionDataIsolation::create($organizationCode, 'resource_visibility_test_user');
    }

    private function cleanUpTestData(): void
    {
        ResourceVisibilityModel::query()
            ->whereIn('organization_code', [$this->organizationCode, $this->anotherOrganizationCode])
            ->delete();
    }
}
