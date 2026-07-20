<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Domain\Agent\Entity;

use Dtyq\SuperMagic\Domain\Agent\Entity\AgentMarketEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentMarketType;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class AgentMarketEntityTest extends TestCase
{
    public function testMarketTypeIsReadFromExplicitField(): void
    {
        $market = new AgentMarketEntity();
        $market->setMarketType(AgentMarketType::ORGANIZATION);

        self::assertSame(AgentMarketType::ORGANIZATION, $market->getMarketType());
    }

    public function testMarketTypeIsNullWhenExplicitFieldIsUnset(): void
    {
        $market = new AgentMarketEntity();

        self::assertNull($market->getMarketType());
    }
}
