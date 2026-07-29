<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Interfaces\SlidesTemplate;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateSourceType;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateAssembler;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateCategoryAssembler;
use App\Interfaces\SlidesTemplate\DTO\Response\AdminSlidesTemplateDetailDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateCountDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateFileUrlDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateListPageDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicDetailDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicListItemDTO;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionClass;
use RuntimeException;

/**
 * @internal
 */
class SlidesTemplateAssemblerTest extends TestCase
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
                    PhpSerializerPacker::class => new PhpSerializerPacker(),
                    ConfigInterface::class => new class implements ConfigInterface {
                        public function get(string $key, mixed $default = null): mixed
                        {
                            return match ($key) {
                                'service_provider.office_organization' => 'OFFICIAL_ORG',
                                default => $default,
                            };
                        }

                        public function has(string $keys): bool
                        {
                            return $keys === 'service_provider.office_organization';
                        }

                        public function set(string $key, mixed $value): void
                        {
                        }
                    },
                    default => throw new RuntimeException('Unexpected container dependency: ' . $id),
                };
            }

            public function has(string $id): bool
            {
                return in_array($id, [ConfigInterface::class, PhpSerializerPacker::class], true);
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

    public function testCreatePublicPageDTOKeepsResponseFieldNames(): void
    {
        $template = $this->makeTemplate();

        $dto = SlidesTemplateAssembler::createPublicListPageDTO([$template], new Page(2, 10));

        $this->assertInstanceOf(SlidesTemplateListPageDTO::class, $dto);
        $this->assertInstanceOf(SlidesTemplatePublicListItemDTO::class, $dto->getList()[0]);
        $this->assertSame([
            'page' => 2,
            'page_size' => 10,
            'list' => [[
                'code' => 'PPT-65f2c8a42d7b0-12345678',
                'source_type' => 'SYSTEM',
                'category_code' => 'PPT-CATE-business',
                'label' => [
                    'zh_CN' => '职场白皮书',
                    'en_US' => 'Corporate Whitepaper',
                ],
                'description' => [
                    'zh_CN' => '适用于企业汇报。',
                    'en_US' => 'For business reviews.',
                ],
                'thumbnail_url' => 'https://signed.example/thumb.png',
                'color' => '#112233',
                'colors' => ['#112233', '#445566'],
                'collage_url' => 'https://signed.example/collage.png',
                'sort' => 100,
                'usage_count' => 215,
                'is_official' => false,
                'tags' => [],
            ]],
        ], $dto->toArray());
    }

    public function testCreatePublicDetailDTOReturnsPublicAssetsWithoutTemplateFileUrl(): void
    {
        $template = $this->makeTemplate();

        $dto = SlidesTemplateAssembler::createPublicDetailDTO($template);

        $this->assertInstanceOf(SlidesTemplatePublicDetailDTO::class, $dto);
        $this->assertSame([
            'code' => 'PPT-65f2c8a42d7b0-12345678',
            'source_type' => 'SYSTEM',
            'category_code' => 'PPT-CATE-business',
            'label' => [
                'zh_CN' => '职场白皮书',
                'en_US' => 'Corporate Whitepaper',
            ],
            'description' => [
                'zh_CN' => '适用于企业汇报。',
                'en_US' => 'For business reviews.',
            ],
            'thumbnail_url' => 'https://signed.example/thumb.png',
            'color' => '#112233',
            'colors' => ['#112233', '#445566'],
            'collage_url' => 'https://signed.example/collage.png',
            'preview_image_urls' => [],
            'preview_url' => 'https://www.letsmagic.cn/share/files/1',
            'sort' => 100,
            'usage_count' => 215,
            'is_official' => false,
            'tags' => [],
        ], $dto->toArray());
        $this->assertArrayNotHasKey('template_file_url', $dto->toArray());
    }

    public function testCreateCountDTO(): void
    {
        $dto = SlidesTemplateAssembler::createCountDTO(1780, 56000, 88);

        $this->assertInstanceOf(SlidesTemplateCountDTO::class, $dto);
        $this->assertSame([
            'total' => 1780,
            'total_usage_count' => 56000,
            'template_count_today_growth' => 88,
        ], $dto->toArray());
    }

    public function testCreateAdminDetailAndFileUrlDTO(): void
    {
        $template = $this->makeTemplate();

        $detailDTO = SlidesTemplateAssembler::createAdminDetailDTO($template);
        $fileUrlDTO = SlidesTemplateAssembler::createFileUrlDTO($template);

        $this->assertInstanceOf(AdminSlidesTemplateDetailDTO::class, $detailDTO);
        $this->assertInstanceOf(SlidesTemplateFileUrlDTO::class, $fileUrlDTO);
        $this->assertSame('https://signed.example/template.zip', $detailDTO->getTemplateFileUrl());
        $this->assertSame('SYSTEM', $detailDTO->getSourceType());
        $this->assertArrayNotHasKey('category', $detailDTO->toArray());
        $this->assertSame([
            'code' => 'PPT-65f2c8a42d7b0-12345678',
            'source_type' => 'SYSTEM',
            'category_code' => 'PPT-CATE-business',
            'label' => [
                'zh_CN' => '职场白皮书',
                'en_US' => 'Corporate Whitepaper',
            ],
            'template_file_url' => 'https://signed.example/template.zip',
        ], $fileUrlDTO->toArray());
    }

    public function testCreateAdminPageDTOIncludesCategory(): void
    {
        $template = $this->makeTemplate();
        $category = new SlidesTemplateCategoryEntity();
        $category->setId(456)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-CATE-business')
            ->setNameI18n(['zh_CN' => '商务', 'en_US' => 'Business'])
            ->setSort(200);

        $dto = SlidesTemplateAssembler::createPageDTO(
            [$template],
            new Page(1, 20),
            1,
            true,
            false,
            ['PPT-CATE-business' => $category]
        );

        $item = $dto->getList()[0]->toArray();
        $this->assertSame([
            'id' => '456',
            'code' => 'PPT-CATE-business',
            'name_i18n' => [
                'zh_CN' => '商务',
                'en_US' => 'Business',
            ],
            'status' => 1,
            'sort' => 200,
            'is_official' => true,
        ], $item['category']);
        $this->assertArrayNotHasKey('template_count', $item['category']);
        unset($item['category']);

        $this->assertSame([
            'id' => '123',
            'organization_code' => 'CURRENT_ORG',
            'code' => 'PPT-65f2c8a42d7b0-12345678',
            'source_type' => 'SYSTEM',
            'category_code' => 'PPT-CATE-business',
            'label' => [
                'zh_CN' => '职场白皮书',
                'en_US' => 'Corporate Whitepaper',
            ],
            'description' => [
                'zh_CN' => '适用于企业汇报。',
                'en_US' => 'For business reviews.',
            ],
            'thumbnail_file_key' => 'slides/thumb.png',
            'thumbnail_url' => 'https://signed.example/thumb.png',
            'colors' => ['#112233', '#445566'],
            'collage_file_key' => 'slides/collage.png',
            'collage_url' => 'https://signed.example/collage.png',
            'preview_image_file_keys' => [],
            'preview_image_urls' => [],
            'template_file_key' => 'slides/template.zip',
            'preview_url' => 'https://www.letsmagic.cn/share/files/1',
            'status' => 1,
            'sort' => 100,
            'base_usage_count' => 100,
            'actual_usage_count' => 23,
            'total_usage_count' => 215,
            'usage_count' => 215,
            'created_uid' => 'user-1',
            'updated_uid' => 'user-2',
            'created_at' => null,
            'updated_at' => null,
            'tags' => [],
        ], $item);
    }

    public function testCreatePublicCategoryPageDTOIncludesTemplateCount(): void
    {
        $category = new SlidesTemplateCategoryEntity();
        $category->setId(123)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setCode('PPT-CATE-business')
            ->setNameI18n(['zh_CN' => '商务', 'en_US' => 'Business'])
            ->setSort(100)
            ->setTemplateCount(3);

        $dto = SlidesTemplateCategoryAssembler::createPageDTO([$category], new Page(1, 200), 1, false);

        $this->assertSame([
            'page' => 1,
            'page_size' => 200,
            'total' => 1,
            'list' => [[
                'id' => '123',
                'code' => 'PPT-CATE-business',
                'name_i18n' => [
                    'zh_CN' => '商务',
                    'en_US' => 'Business',
                ],
                'sort' => 100,
                'template_count' => 3,
                'is_official' => true,
            ]],
        ], $dto->toArray());
    }

    private function makeTemplate(): SlidesTemplateEntity
    {
        $template = new SlidesTemplateEntity();
        $template->setId(123)
            ->setOrganizationCode('CURRENT_ORG')
            ->setCode('PPT-65f2c8a42d7b0-12345678')
            ->setSourceType(SlidesTemplateSourceType::System)
            ->setCategoryCode('PPT-CATE-business')
            ->setLabel([
                'zh_CN' => '职场白皮书',
                'en_US' => 'Corporate Whitepaper',
            ])
            ->setDescription([
                'zh_CN' => '适用于企业汇报。',
                'en_US' => 'For business reviews.',
            ])
            ->setThumbnailFileKey('slides/thumb.png')
            ->setThumbnailUrl('https://signed.example/thumb.png')
            ->setColors(['#112233', '#445566'])
            ->setCollageFileKey('slides/collage.png')
            ->setCollageUrl('https://signed.example/collage.png')
            ->setTemplateFileKey('slides/template.zip')
            ->setTemplateFileUrl('https://signed.example/template.zip')
            ->setPreviewUrl('https://www.letsmagic.cn/share/files/1')
            ->setStatus(1)
            ->setSort(100)
            ->setBaseUsageCount(100)
            ->setActualUsageCount(23)
            ->setTotalUsageCount(215)
            ->setCreatedUid('user-1')
            ->setUpdatedUid('user-2');

        return $template;
    }
}
