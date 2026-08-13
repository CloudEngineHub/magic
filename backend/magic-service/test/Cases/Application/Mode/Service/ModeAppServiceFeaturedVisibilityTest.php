<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Mode\Service;

use App\Application\Mode\Service\ModeAppService;
use App\Domain\SuperMagic\Agent\Entity\SuperMagicAgentEntity;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * @internal
 */
class ModeAppServiceFeaturedVisibilityTest extends TestCase
{
    #[DataProvider('categoryVisibilityProvider')]
    public function testBuildFeaturedAgentMetadataMapsCategoryToVisibility(
        string $category,
        bool $expectedVisibility
    ): void {
        $this->assertTrue(
            method_exists(ModeAppService::class, 'buildFeaturedAgentMetadata'),
            'Featured agent metadata should expose the user visibility state.'
        );

        $service = (new ReflectionClass(ModeAppService::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(ModeAppService::class, 'buildFeaturedAgentMetadata');
        $agent = new SuperMagicAgentEntity();
        $agent->setCategory($category);

        $result = $method->invoke($service, $agent);

        $this->assertSame($category, $result['category']);
        $this->assertSame($expectedVisibility, $result['is_visible']);
    }

    public static function categoryVisibilityProvider(): array
    {
        return [
            'visible employee' => ['frequent', true],
            'hidden employee' => ['all', false],
        ];
    }
}
