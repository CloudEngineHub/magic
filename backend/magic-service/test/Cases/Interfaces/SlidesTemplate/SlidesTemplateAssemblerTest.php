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
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateFileUrlDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePageDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicItemDTO;
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

        $dto = SlidesTemplateAssembler::createPageDTO([$template], new Page(2, 10), 1, false, false);

        $this->assertInstanceOf(SlidesTemplatePageDTO::class, $dto);
        $this->assertInstanceOf(SlidesTemplatePublicItemDTO::class, $dto->getList()[0]);
        $this->assertSame([
            'page' => 2,
            'page_size' => 10,
            'total' => 1,
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
                'collage_url' => 'https://signed.example/collage.png',
                'preview_url' => 'https://www.letsmagic.cn/share/files/1',
                'sort' => 100,
                'is_official' => false,
            ]],
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
            ->setCollageFileKey('slides/collage.png')
            ->setCollageUrl('https://signed.example/collage.png')
            ->setTemplateFileKey('slides/template.zip')
            ->setTemplateFileUrl('https://signed.example/template.zip')
            ->setPreviewUrl('https://www.letsmagic.cn/share/files/1')
            ->setStatus(1)
            ->setSort(100)
            ->setCreatedUid('user-1')
            ->setUpdatedUid('user-2');

        return $template;
    }
}
