<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Domain\Agent\Entity\ValueObject\Query;

use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentMarketType;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query\AgentMarketQuery;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class AgentMarketQueryTest extends TestCase
{
    public function testItCarriesTheCurrentOrganizationShelfIds(): void
    {
        $query = new AgentMarketQuery();

        $query->setVisibleOrganizationShelf('ORG-1', [30, 10, 30]);

        $this->assertSame('ORG-1', $query->getVisibleOrganizationCode());
        $this->assertSame([30, 10], $query->getVisibleOrganizationMarketIds());
    }

    public function testItCarriesAnOptionalMarketTypeFilter(): void
    {
        $query = new AgentMarketQuery();

        $query->setMarketType(AgentMarketType::ORGANIZATION);

        $this->assertSame(AgentMarketType::ORGANIZATION, $query->getMarketType());
    }
}
