<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\Agent\Service;

use App\Domain\Contact\Service\MagicUserDomainService;
use Dtyq\SuperMagic\Application\Agent\Service\AdminSuperMagicCategoryAppService;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentCategoryEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentCategoryQuery;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentCategoryDomainService;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Request\QueryAgentCategoriesRequestAdminDTO;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionProperty;

/**
 * @internal
 */
class AdminSuperMagicCategoryAppServiceTest extends TestCase
{
    public function testQueryReturnsCategoryIdAsString(): void
    {
        $service = $this->createService([$this->createCategory()]);

        $result = $service->query(new QueryAgentCategoriesRequestAdminDTO());

        self::assertSame('935290509114109952', $result[0]['id']);
    }

    public function testQueryPassesFilterToDomainService(): void
    {
        $requestDTO = new QueryAgentCategoriesRequestAdminDTO();
        $requestDTO->setStatus(0);
        $requestDTO->keyword = '测试';

        $service = $this->createService([$this->createCategory(status: 0)]);

        $result = $service->query($requestDTO);

        self::assertSame('935290509114109952', $result[0]['id']);
    }

    public function testGetDetailReturnsCategoryIdAsString(): void
    {
        $category = $this->createCategory();
        $service = $this->createService([$category], $category);

        $result = $service->getDetail(935290509114109952);

        self::assertSame('935290509114109952', $result['id']);
    }

    /** @param AgentCategoryEntity[] $categories */
    private function createService(
        array $categories,
        ?AgentCategoryEntity $category = null
    ): AdminSuperMagicCategoryAppService {
        $domainService = new class($categories, $category) extends SuperMagicAgentCategoryDomainService {
            public function __construct(
                private readonly array $categories,
                private readonly ?AgentCategoryEntity $category,
            ) {
            }

            public function findAll(): array
            {
                return $this->categories;
            }

            public function findByQuery(AgentCategoryQuery $query): array
            {
                return array_values(array_filter(
                    $this->categories,
                    static function (AgentCategoryEntity $category) use ($query): bool {
                        if ($query->getStatus() !== null && $category->getStatus() !== $query->getStatus()) {
                            return false;
                        }

                        $keyword = trim((string) $query->getKeyword());
                        if ($keyword === '') {
                            return true;
                        }

                        foreach ($category->getNameI18n() as $name) {
                            if (is_string($name) && str_contains($name, $keyword)) {
                                return true;
                            }
                        }

                        return false;
                    }
                ));
            }

            public function findById(int $id): ?AgentCategoryEntity
            {
                return $this->category;
            }

            public function getMarketReferenceCount(int $categoryId): int
            {
                return 0;
            }

            public function getMarketReferenceCounts(array $categoryIds): array
            {
                return [];
            }
        };

        $service = (new ReflectionClass(AdminSuperMagicCategoryAppService::class))->newInstanceWithoutConstructor();
        $property = new ReflectionProperty($service, 'categoryDomainService');
        $property->setValue($service, $domainService);

        $userDomainService = $this->createMock(MagicUserDomainService::class);
        $userDomainService->method('getUserByIdsWithoutOrganization')->willReturn([]);

        $property = new ReflectionProperty($service, 'magicUserDomainService');
        $property->setValue($service, $userDomainService);

        return $service;
    }

    private function createCategory(int $status = 1): AgentCategoryEntity
    {
        $category = (new ReflectionClass(AgentCategoryEntity::class))->newInstanceWithoutConstructor();
        foreach ([
            'id' => 935290509114109952,
            'organizationCode' => 'TGosRaFhvb',
            'nameI18n' => ['zh_CN' => '测试分类'],
            'sortOrder' => 1,
            'status' => $status,
            'creatorId' => 'user-1',
            'modifierId' => null,
        ] as $property => $value) {
            (new ReflectionProperty($category, $property))->setValue($category, $value);
        }

        return $category;
    }
}
