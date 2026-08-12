<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Project\Service;

use App\Application\SuperMagic\Project\DTO\Request\PublishMicroAppRequestDTO;
use App\Application\SuperMagic\Project\Service\MicroAppShareConfig;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class MicroAppShareConfigTest extends TestCase
{
    public function testBuildExtraPreservesExistingValuesWhenExtraIsProvided(): void
    {
        $requestDTO = new PublishMicroAppRequestDTO();
        $requestDTO->setExtra([
            'pure_mode' => false,
            'allow_download_project_file' => true,
        ]);

        self::assertSame([
            'allow_copy_project_files' => true,
            'pure_mode' => false,
        ], (new MicroAppShareConfig())->buildExtra(['allow_copy_project_files' => true], $requestDTO));
    }

    public function testBuildExtraReturnsNullWhenExtraIsNotProvided(): void
    {
        self::assertNull((new MicroAppShareConfig())->buildExtra(
            ['pure_mode' => true],
            new PublishMicroAppRequestDTO()
        ));
    }

    public function testFormatResponseExtraUsesTheCommonShareExtraFormat(): void
    {
        $config = new MicroAppShareConfig();

        self::assertSame(['pure_mode' => true], $config->formatResponseExtra(['pure_mode' => '1']));
        self::assertSame(['pure_mode' => false], $config->formatResponseExtra(['pure_mode' => '0']));
        self::assertSame(['pure_mode' => false], $config->formatResponseExtra(null));
    }
}
