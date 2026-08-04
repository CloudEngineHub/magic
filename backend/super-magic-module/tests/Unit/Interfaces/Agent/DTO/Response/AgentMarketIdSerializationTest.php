<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Interfaces\Agent\DTO\Response;

use Dtyq\SuperMagic\Interfaces\Agent\DTO\Response\AgentMarketListItemAdminDTO;
use Dtyq\SuperMagic\Interfaces\Agent\DTO\Response\AgentMarketListItemDTO;
use Dtyq\SuperMagic\Interfaces\Skill\DTO\Response\OrganizationInfoAdminDTO;
use Dtyq\SuperMagic\Interfaces\Skill\DTO\Response\PublisherInfoAdminDTO;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class AgentMarketIdSerializationTest extends TestCase
{
    public function testAdminMarketCategoryIdIsString(): void
    {
        $dto = new AgentMarketListItemAdminDTO(
            id: '935290509114109952',
            organization: new OrganizationInfoAdminDTO(code: 'TGosRaFhvb', name: '测试组织'),
            agentCode: 'design',
            agentVersionId: '935290509114109953',
            nameI18n: [],
            roleI18n: [],
            descriptionI18n: [],
            icon: null,
            iconType: 1,
            publisherId: 'user-1',
            publisherType: 'user',
            categoryId: 935290509114109954,
            category: null,
            categoryIds: [935290509114109954],
            categories: [],
            publishStatus: 'published',
            installCount: 0,
            sortOrder: 0,
            isFeatured: false,
            isHidden: false,
            publisher: PublisherInfoAdminDTO::empty(),
            createdAt: null,
            updatedAt: null,
        );

        self::assertSame('935290509114109954', $dto->toArray()['category_id']);
    }

    public function testMarketNullCategoryIdRemainsNull(): void
    {
        $dto = new AgentMarketListItemDTO(
            id: 935290509114109952,
            agentCode: 'design',
            userCode: null,
            nameI18n: [],
            roleI18n: [],
            descriptionI18n: [],
            icon: null,
            iconType: 1,
            playbooks: [],
            publisherType: 'user',
            publisher: [],
            categoryId: null,
            categoryIds: [],
            isFeatured: false,
            marketType: 'MARKET',
            isAdded: false,
            latestVersionCode: null,
            allowDelete: false,
            createdAt: '',
            updatedAt: '',
        );

        self::assertNull($dto->toArray()['category_id']);
        self::assertSame('MARKET', $dto->toArray()['market_type']);
    }
}
