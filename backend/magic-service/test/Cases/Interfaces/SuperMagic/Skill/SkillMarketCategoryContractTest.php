<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Interfaces\SuperMagic\Skill;

use App\Application\SuperMagic\Skill\Service\AdminSkillCategoryAppService;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Domain\SuperMagic\Skill\Entity\SkillCategoryEntity;
use App\Domain\SuperMagic\Skill\Entity\SkillMarketEntity;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\Query\SkillQuery;
use App\Domain\SuperMagic\Skill\Service\SkillCategoryDomainService;
use App\Infrastructure\Util\Context\CoContext;
use App\Interfaces\SuperMagic\Skill\DTO\Request\PublishSkillRequestDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Request\UpdateSkillMarketRequestAdminDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Response\OrganizationInfoAdminDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Response\PublisherInfoAdminDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Response\SkillMarketListItemAdminDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Response\SkillMarketListItemDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Response\SkillPublishPrefillResponseDTO;
use App\Interfaces\SuperMagic\Skill\FormRequest\SkillQueryFormRequest;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionClass;
use ReflectionMethod;
use RuntimeException;

/**
 * @internal
 */
final class SkillMarketCategoryContractTest extends TestCase
{
    public static function setUpBeforeClass(): void
    {
        if (! ApplicationContext::hasContainer()) {
            ApplicationContext::setContainer(new class implements ContainerInterface {
                public function get(string $id)
                {
                    return match ($id) {
                        PhpSerializerPacker::class => new PhpSerializerPacker(),
                        default => throw new RuntimeException('Unsupported service: ' . $id),
                    };
                }

                public function has(string $id): bool
                {
                    return $id === PhpSerializerPacker::class;
                }
            });
        }
    }

    public function testPublishRequestAcceptsAtMostOneHundredCategoriesOnlyForMarket(): void
    {
        $method = new ReflectionMethod(PublishSkillRequestDTO::class, 'getHyperfValidationRules');
        $method->setAccessible(true);
        $rules = $method->invoke(null);

        $this->assertSame(
            'exclude_unless:publish_target_type,MARKET|nullable|array|max:100',
            $rules['category_ids']
        );
        $this->assertSame('integer|min:1', $rules['category_ids.*']);
    }

    public function testMarketQueryAcceptsStringCategoryIds(): void
    {
        $request = (new ReflectionClass(SkillQueryFormRequest::class))->newInstanceWithoutConstructor();

        $this->assertSame('nullable|array|max:100', $request->rules()['category_ids']);
        $this->assertSame('string|max:64|regex:/^\d+$/', $request->rules()['category_ids.*']);
        $this->assertArrayHasKey('category_ids.*.string', $request->messages());
        $this->assertArrayHasKey('category_ids.*.regex', $request->messages());
    }

    public function testMarketQueryNormalizesStringCategoryIdsToIntegers(): void
    {
        $query = new SkillQuery(['category_ids' => ['10001', '10002']]);

        $this->assertSame([10001, 10002], $query->getCategoryIds());
    }

    public function testUpdateMarketRequestDoesNotExposeSingleCategoryId(): void
    {
        $reflection = new ReflectionClass(UpdateSkillMarketRequestAdminDTO::class);

        $this->assertFalse($reflection->hasProperty('categoryId'));
        $this->assertFalse($reflection->hasMethod('setCategoryId'));
        $this->assertArrayNotHasKey('category_id', $this->getValidationRules(UpdateSkillMarketRequestAdminDTO::class));
    }

    public function testUpdateMarketRequestCanClearAllCategories(): void
    {
        $dto = new UpdateSkillMarketRequestAdminDTO();
        $dto->setCategoryIds([]);

        $this->assertSame(['category_ids' => []], $dto->getUpdatePayload());
        $this->assertTrue($dto->hasUpdates());
    }

    public function testSkillMarketEntitySerializesCategoryIdsWithoutCategoryId(): void
    {
        $entity = new SkillMarketEntity([
            'id' => 1,
            'organizationCode' => 'org-code',
            'skillCode' => 'skill-code',
            'skillVersionId' => 2,
            'publisherId' => 'user-id',
            'categoryIds' => [10, 20],
        ]);

        $payload = $entity->toArray();

        $this->assertSame([10, 20], $payload['category_ids']);
        $this->assertArrayNotHasKey('category_id', $payload);
    }

    public function testAdminMarketResponseUsesCategoryIdsWithoutCategoryId(): void
    {
        $payload = (new SkillMarketListItemAdminDTO(
            id: '1',
            organization: new OrganizationInfoAdminDTO('org', 'Org'),
            skillCode: 'skill-code',
            skillVersionId: '2',
            packageName: 'package',
            nameI18n: [],
            descriptionI18n: [],
            logo: null,
            publisherId: 'user',
            publisherType: 'USER',
            categoryIds: [10, 20],
            publishStatus: 'PUBLISHED',
            installCount: 0,
            sortOrder: null,
            isFeatured: false,
            isHidden: false,
            publisher: PublisherInfoAdminDTO::empty(),
            createdAt: null,
            updatedAt: null,
        ))->toArray();

        $this->assertSame(['10', '20'], $payload['category_ids']);
        $this->assertArrayNotHasKey('category_id', $payload);
    }

    public function testPublishPrefillResponseExposesLocalizedDescriptionAndLegacyI18nDescription(): void
    {
        $payload = (new SkillPublishPrefillResponseDTO(
            version: '1.0.0',
            description: 'Description',
            versionDescriptionI18n: ['default' => 'Description'],
            publishTargetType: null,
            publishTargetValue: null,
        ))->toArray();

        $this->assertSame('Description', $payload['description']);
        $this->assertSame(['default' => 'Description'], $payload['version_description_i18n']);
    }

    public function testPublicCategoryTreeReturnsLocalizedNamesWithoutI18nPayloadAtEveryLevel(): void
    {
        $parent = (new SkillCategoryEntity())
            ->setId(10)
            ->setNameI18n(['default' => 'Parent default', 'en_US' => 'Parent']);
        $child = (new SkillCategoryEntity())
            ->setId(20)
            ->setParentId(10)
            ->setNameI18n(['default' => 'Child default', 'en_US' => 'Child']);

        $categoryDomainService = $this->createMock(SkillCategoryDomainService::class);
        $categoryDomainService->method('findByQuery')->willReturn([$parent, $child]);
        $categoryDomainService->method('getVisiblePublishedMarketIdsMap')->willReturn([10 => [], 20 => []]);

        CoContext::setLanguage('en_US');
        $tree = (new AdminSkillCategoryAppService(
            $categoryDomainService,
            $this->createMock(MagicUserDomainService::class),
        ))->getPublicTree(true);

        $this->assertSame('Parent', $tree[0]['name']);
        $this->assertArrayNotHasKey('name_i18n', $tree[0]);
        $this->assertSame('Child', $tree[0]['children'][0]['name']);
        $this->assertArrayNotHasKey('name_i18n', $tree[0]['children'][0]);
    }

    public function testMarketListResponseExposesLocalizedSourceAndLegacyI18nFields(): void
    {
        $payload = (new SkillMarketListItemDTO(
            id: 1,
            skillCode: 'skill-code',
            userSkillCode: 'skill-code',
            name: 'Skill name',
            description: 'Skill description',
            source: 'Skill source',
            nameI18n: ['default' => 'Skill name'],
            descriptionI18n: ['default' => 'Skill description'],
            sourceI18n: ['default' => 'Skill source'],
            logo: '',
            publisherType: 'OFFICIAL',
            publisher: [],
            publishStatus: 'PUBLISHED',
            isAdded: false,
            needUpgrade: false,
            isCreator: false,
            isFeatured: false,
            createdAt: '',
            updatedAt: '',
        ))->jsonSerialize();

        $this->assertSame('Skill source', $payload['source']);
        $this->assertSame(['default' => 'Skill name'], $payload['name_i18n']);
        $this->assertSame(['default' => 'Skill description'], $payload['description_i18n']);
        $this->assertSame(['default' => 'Skill source'], $payload['source_i18n']);
    }

    /**
     * @param class-string $dtoClass
     * @return array<string, mixed>
     */
    private function getValidationRules(string $dtoClass): array
    {
        $method = new ReflectionMethod($dtoClass, 'getHyperfValidationRules');
        $method->setAccessible(true);

        return $method->invoke(null);
    }
}
