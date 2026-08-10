<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\SuperAgent\Service;

use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishMicroAppRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppShareConfig;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class MicroAppShareConfigTest extends TestCase
{
    public function testBuildExtraPreservesExistingValuesWhenPureModeIsProvided(): void
    {
        $requestDTO = new PublishMicroAppRequestDTO();
        $requestDTO->setPureMode(false);

        self::assertSame([
            'allow_copy_project_files' => true,
            'pure_mode' => false,
        ], (new MicroAppShareConfig())->buildExtra(['allow_copy_project_files' => true], $requestDTO));
    }

    public function testBuildExtraReturnsNullWhenPureModeIsNotProvided(): void
    {
        self::assertNull((new MicroAppShareConfig())->buildExtra(
            ['pure_mode' => true],
            new PublishMicroAppRequestDTO()
        ));
    }

    public function testIsPureModeNormalizesBooleanValues(): void
    {
        $config = new MicroAppShareConfig();

        self::assertTrue($config->isPureMode(['pure_mode' => '1']));
        self::assertFalse($config->isPureMode(['pure_mode' => '0']));
        self::assertFalse($config->isPureMode(null));
    }
}
