<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Agent;

use Dtyq\SuperMagic\Application\Agent\Service\SuperMagicAgentAppService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * @internal
 */
class SuperMagicAgentFeaturedOrderTest extends TestCase
{
    public function testResolveFeaturedOrderGroupsIncludesVisibleAndHiddenCodes(): void
    {
        $this->assertTrue(
            method_exists(SuperMagicAgentAppService::class, 'resolveFeaturedOrderGroups'),
            'Featured order resolver should include visible and hidden employee groups.'
        );

        $service = (new ReflectionClass(SuperMagicAgentAppService::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(SuperMagicAgentAppService::class, 'resolveFeaturedOrderGroups');

        $result = $method->invoke($service, [
            'frequent' => ['visible-a', 'duplicate'],
            'all' => ['hidden-a', 'duplicate', 'hidden-b'],
        ]);

        $this->assertSame(['visible-a', 'duplicate'], $result['frequent']);
        $this->assertSame(['hidden-a', 'hidden-b'], $result['all']);
        $this->assertSame(
            ['visible-a', 'duplicate', 'hidden-a', 'hidden-b'],
            $result['query']
        );
    }
}
