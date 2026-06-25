<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Interfaces\Design\Assembler;

use App\Domain\Design\Entity\ImageGenerationEntity;
use App\Interfaces\Design\Assembler\ImageGenerationAssembler;
use App\Interfaces\Design\DTO\ImageGenerationDTO;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class ImageGenerationAssemblerTest extends TestCase
{
    public function testToDOPassesImageGenerationConfig(): void
    {
        $dto = new ImageGenerationDTO();
        $dto->setProjectId('1');
        $dto->setImageId('img_1');
        $dto->setModelId('gpt-image-2');
        $dto->setFileDir('/workspace');
        $dto->setImageGenerationConfig([
            'quality' => 'high',
        ]);

        $entity = ImageGenerationAssembler::toDO($dto);

        $this->assertSame(['quality' => 'high'], $entity->getImageGenerationConfig());
    }

    public function testImageGenerationEntityStoresMultiImageFields(): void
    {
        $entity = new ImageGenerationEntity();
        $entity->setGenerateNum(3);
        $entity->setOutputImages([
            ['index' => 1, 'file_name' => 'poster.png', 'file_path' => '/poster.png'],
            ['index' => 2, 'file_name' => 'poster_2.png', 'file_path' => '/poster_2.png'],
        ]);
        $entity->setImages([
            ['index' => 1, 'file_name' => 'poster.png', 'file_url' => 'https://example.test/poster.png'],
            ['index' => 2, 'file_name' => 'poster_2.png', 'file_url' => 'https://example.test/poster_2.png'],
        ]);

        $this->assertSame(3, $entity->getGenerateNum());
        $this->assertSame([
            ['index' => 1, 'file_name' => 'poster.png', 'file_path' => '/poster.png'],
            ['index' => 2, 'file_name' => 'poster_2.png', 'file_path' => '/poster_2.png'],
        ], $entity->getOutputImages());
        $this->assertSame([
            ['index' => 1, 'file_name' => 'poster.png', 'file_url' => 'https://example.test/poster.png'],
            ['index' => 2, 'file_name' => 'poster_2.png', 'file_url' => 'https://example.test/poster_2.png'],
        ], $entity->getImages());
    }
}
