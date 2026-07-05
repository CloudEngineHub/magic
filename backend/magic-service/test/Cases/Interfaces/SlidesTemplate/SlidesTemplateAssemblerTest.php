<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Interfaces\SlidesTemplate;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateSourceType;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateAssembler;
use App\Interfaces\SlidesTemplate\DTO\Response\AdminSlidesTemplateDetailDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplateFileUrlDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePageDTO;
use App\Interfaces\SlidesTemplate\DTO\Response\SlidesTemplatePublicItemDTO;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class SlidesTemplateAssemblerTest extends TestCase
{
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
            'label' => [
                'zh_CN' => '职场白皮书',
                'en_US' => 'Corporate Whitepaper',
            ],
            'template_file_url' => 'https://signed.example/template.zip',
        ], $fileUrlDTO->toArray());
    }

    private function makeTemplate(): SlidesTemplateEntity
    {
        $template = new SlidesTemplateEntity();
        $template->setId(123)
            ->setOrganizationCode('CURRENT_ORG')
            ->setCode('PPT-65f2c8a42d7b0-12345678')
            ->setSourceType(SlidesTemplateSourceType::System)
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
