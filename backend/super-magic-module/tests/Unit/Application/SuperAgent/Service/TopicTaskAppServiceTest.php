<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\SuperAgent\Service;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\SuperAgentExtra;
use Dtyq\SuperMagic\Application\SuperAgent\Service\TopicTaskAppService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TopicEntity;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * @internal
 */
class TopicTaskAppServiceTest extends TestCase
{
    public function testRequestSmaTopicPatternOverridesThePersistedAgentCode(): void
    {
        $service = (new ReflectionClass(TopicTaskAppService::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(TopicTaskAppService::class, 'resolveEffectiveAgentCode');
        $method->setAccessible(true);

        $topic = new TopicEntity(['agent_code' => 'SMA-persisted']);
        $extra = new SuperAgentExtra();
        $extra->setTopicPattern('SMA-request');

        $this->assertSame('SMA-request', $method->invoke($service, $topic, $extra));
    }
}
