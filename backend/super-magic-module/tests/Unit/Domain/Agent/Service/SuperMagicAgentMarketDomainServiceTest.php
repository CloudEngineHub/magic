<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Domain\Agent\Service;

use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentMarketRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Repository\Facade\AgentPlaybookRepositoryInterface;
use Dtyq\SuperMagic\Domain\Agent\Entity\AgentMarketEntity;
use Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\AgentMarketType;
use Dtyq\SuperMagic\Domain\Agent\Service\SuperMagicAgentMarketDomainService;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class SuperMagicAgentMarketDomainServiceTest extends TestCase
{
    public function testItMergesShelfAndCollaborativeOrganizationMarketIds(): void
    {
        $marketRepository = $this->createMock(AgentMarketRepositoryInterface::class);
        $marketRepository->expects(self::once())
            ->method('findPublishedOrganizationIdsByAgentCodes')
            ->with('ORG', ['agent-collaborative'])
            ->willReturn([20, 30]);

        $service = new SuperMagicAgentMarketDomainService(
            $this->createMock(AgentPlaybookRepositoryInterface::class),
            $marketRepository,
        );

        self::assertSame(
            [10, 20, 30],
            $service->mergeVisibleOrganizationMarketIds('ORG', ['10', '20'], ['agent-collaborative'])
        );
    }

    public function testItAllowsCollaboratorToDiscoverOrganizationMarketOutsideShelf(): void
    {
        $service = new SuperMagicAgentMarketDomainService(
            $this->createMock(AgentPlaybookRepositoryInterface::class),
            $this->createMock(AgentMarketRepositoryInterface::class),
        );
        $market = new AgentMarketEntity();
        $market->setId(99)->setAgentCode('agent-collaborative');
        $market->setOrganizationCode('ORG');
        $market->setMarketType(AgentMarketType::ORGANIZATION);

        self::assertTrue($service->isMarketDiscoverable(
            $market,
            'ORG',
            false,
            true,
        ));
    }
}
