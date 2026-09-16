<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\VolcengineArk\Assets;

use App\Infrastructure\ExternalAPI\VolcengineArk\Assets\VolcengineArkAssetProvider;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
final class VolcengineArkAssetProviderTest extends TestCase
{
    public function testComplianceFailureUsesProviderErrorCodeAndMessage(): void
    {
        $provider = (new ReflectionClass(VolcengineArkAssetProvider::class))->newInstanceWithoutConstructor();

        self::assertSame(
            'InvalidParameter.HeightTooSmall：Height must be between 300px and 6000px.',
            $provider->extractComplianceFailedReason(
                [
                    'ResponseMetadata' => [
                        'Error' => [
                            'Code' => 'InvalidParameter.HeightTooSmall',
                            'Message' => 'Height must be between 300px and 6000px.',
                        ],
                    ],
                ],
                'FAILED',
            ),
        );
    }
}
