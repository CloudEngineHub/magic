<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\ModelGateway\Entity\Dto;

use App\Domain\ModelGateway\Entity\Dto\TextGenerateImageDTO;
use App\Infrastructure\Core\Exception\BusinessException;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class TextGenerateImageDTOTest extends TestCase
{
    public function testAllowsImageCountAboveLegacyGlobalLimit(): void
    {
        $dto = new TextGenerateImageDTO([
            'model' => 'seedream-4-0',
            'prompt' => 'make an image',
            'n' => 8,
        ]);

        $dto->valid();

        $this->assertSame(8, $dto->getN());
    }

    public function testRejectsImageCountBelowOne(): void
    {
        $dto = new TextGenerateImageDTO([
            'model' => 'seedream-4-0',
            'prompt' => 'make an image',
            'n' => 0,
        ]);

        $this->expectException(BusinessException::class);
        $dto->valid();
    }
}
