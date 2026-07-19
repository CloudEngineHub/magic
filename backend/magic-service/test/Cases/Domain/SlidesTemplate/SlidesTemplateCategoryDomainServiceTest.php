<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\SlidesTemplate;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateCategoryQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateCategoryStatus;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateCategoryRepositoryInterface;
use App\Domain\SlidesTemplate\Service\SlidesTemplateCategoryDomainService;
use App\ErrorCode\SlidesTemplateErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\ValueObject\Page;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionClass;
use RuntimeException;

/**
 * @internal
 */
class SlidesTemplateCategoryDomainServiceTest extends TestCase
{
    private static bool $hadOriginalContainer = false;

    private static ?ContainerInterface $originalContainer = null;

    public static function setUpBeforeClass(): void
    {
        self::$hadOriginalContainer = ApplicationContext::hasContainer();
        self::$originalContainer = self::$hadOriginalContainer ? ApplicationContext::getContainer() : null;

        ApplicationContext::setContainer(new class implements ContainerInterface {
            public function get(string $id)
            {
                return match ($id) {
                    ConfigInterface::class => new class implements ConfigInterface {
                        public function get(string $key, mixed $default = null): mixed
                        {
                            return match ($key) {
                                'error_message' => [
                                    'exception_class' => BusinessException::class,
                                    'error_code_mapper' => [
                                        SlidesTemplateErrorCode::class => [47000, 47999],
                                    ],
                                ],
                                default => $default,
                            };
                        }

                        public function has(string $keys): bool
                        {
                            return $keys === 'error_message';
                        }

                        public function set(string $key, mixed $value): void
                        {
                        }
                    },
                    TranslatorInterface::class => new class implements TranslatorInterface {
                        public function trans(string $key, array $replace = [], ?string $locale = null): string
                        {
                            return $key;
                        }

                        public function transChoice(string $key, $number, array $replace = [], ?string $locale = null): string
                        {
                            return $key;
                        }

                        public function getLocale(): string
                        {
                            return 'zh_CN';
                        }

                        public function setLocale(string $locale)
                        {
                            return $this;
                        }
                    },
                    default => throw new RuntimeException('Unexpected container dependency: ' . $id),
                };
            }

            public function has(string $id): bool
            {
                return in_array($id, [ConfigInterface::class, TranslatorInterface::class], true);
            }
        });
    }

    public static function tearDownAfterClass(): void
    {
        $property = (new ReflectionClass(ApplicationContext::class))->getProperty('container');
        $property->setAccessible(true);
        $property->setValue(null, self::$hadOriginalContainer ? self::$originalContainer : null);

        self::$hadOriginalContainer = false;
        self::$originalContainer = null;
    }

    public function testCreateThrowsBusinessExceptionWhenCodeAlreadyExists(): void
    {
        $repository = new CapturingSlidesTemplateCategoryRepository();
        $repository->entityWithTrashed = $this->makeCategory()->setId(123);
        $service = new SlidesTemplateCategoryDomainService($repository);

        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(SlidesTemplateErrorCode::CATEGORY_CODE_ALREADY_EXISTS->value);

        $service->create($this->makeDataIsolation(), $this->makeCategory());
    }

    public function testCreateRestoresDeletedCategoryWithSameCodeAndUsesNewCreator(): void
    {
        $repository = new CapturingSlidesTemplateCategoryRepository();
        $repository->entityWithTrashed = $this->makeCategory()
            ->setId(123)
            ->setCreatedUid('old-user')
            ->setUpdatedUid('old-user')
            ->setDeletedAt('2026-07-01 10:00:00');
        $service = new SlidesTemplateCategoryDomainService($repository);

        $category = $this->makeCategory()
            ->setNameI18n(['zh_CN' => '新分类', 'en_US' => 'New Category'])
            ->setCreatedUid('new-user')
            ->setUpdatedUid('new-user');

        $result = $service->create($this->makeDataIsolation(), $category);

        $this->assertSame($category, $result);
        $this->assertSame(123, $repository->savedEntity?->getId());
        $this->assertSame(['zh_CN' => '新分类', 'en_US' => 'New Category'], $repository->savedEntity?->getNameI18n());
        $this->assertSame('new-user', $repository->savedEntity?->getCreatedUid());
        $this->assertSame('new-user', $repository->savedEntity?->getUpdatedUid());
    }

    private function makeCategory(): SlidesTemplateCategoryEntity
    {
        $category = new SlidesTemplateCategoryEntity();
        $category->setCode('PPT-CATE-business')
            ->setNameI18n(['zh_CN' => '商务', 'en_US' => 'Business'])
            ->setStatus(SlidesTemplateCategoryStatus::Enabled)
            ->setSort(100);

        return $category;
    }

    private function makeDataIsolation(): SlidesTemplateDataIsolation
    {
        /** @var SlidesTemplateDataIsolation $dataIsolation */
        $dataIsolation = (new ReflectionClass(SlidesTemplateDataIsolation::class))->newInstanceWithoutConstructor();
        $dataIsolation->setCurrentOrganizationCode('OFFICIAL_ORG');
        $dataIsolation->setCurrentUserId('user-1');
        $dataIsolation->setMagicId('magic-1');
        $dataIsolation->setEnabled(true);
        return $dataIsolation;
    }
}

class CapturingSlidesTemplateCategoryRepository implements SlidesTemplateCategoryRepositoryInterface
{
    public ?SlidesTemplateCategoryEntity $savedEntity = null;

    public ?SlidesTemplateCategoryEntity $entityToFind = null;

    public ?SlidesTemplateCategoryEntity $entityWithTrashed = null;

    public function findById(SlidesTemplateDataIsolation $dataIsolation, int|string $id): ?SlidesTemplateCategoryEntity
    {
        return $this->entityToFind;
    }

    public function findByCode(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateCategoryEntity
    {
        return $this->entityToFind;
    }

    public function findByCodeWithTrashed(SlidesTemplateDataIsolation $dataIsolation, string $code): ?SlidesTemplateCategoryEntity
    {
        return $this->entityWithTrashed;
    }

    public function findByCodes(SlidesTemplateDataIsolation $dataIsolation, array $codes): array
    {
        return [];
    }

    public function queries(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryQuery $query, Page $page): array
    {
        return ['total' => 0, 'list' => []];
    }

    public function queriesWithTemplateCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryQuery $query, Page $page): array
    {
        return ['total' => 0, 'list' => []];
    }

    public function save(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateCategoryEntity $entity): SlidesTemplateCategoryEntity
    {
        $this->savedEntity = $entity;
        return $entity;
    }

    public function updateStatus(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $status, string $updatedUid): bool
    {
        return true;
    }

    public function updateSort(SlidesTemplateDataIsolation $dataIsolation, int|string $id, int $sort, string $updatedUid): bool
    {
        return true;
    }

    public function delete(SlidesTemplateDataIsolation $dataIsolation, int|string $id): bool
    {
        return true;
    }
}
