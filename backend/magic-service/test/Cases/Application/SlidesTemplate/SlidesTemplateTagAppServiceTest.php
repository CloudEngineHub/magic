<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Application\SlidesTemplate;

use App\Application\SlidesTemplate\Service\SlidesTemplateTagAppService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Domain\SlidesTemplate\Service\SlidesTemplateTagDomainService;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateTagRequest;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
class SlidesTemplateTagAppServiceTest extends TestCase
{
    public function testQueriesGroupsUseCurrentAndOfficialVisibleTagsByCategory(): void
    {
        $dataIsolation = $this->makeDataIsolation('CURRENT_ORG', ['OFFICIAL_ORG']);
        $request = new TestPublicQuerySlidesTemplateTagGroupsRequest(categoryCode: 'PPT-CATE-work');

        $group = new SlidesTemplateTagEntity();
        $group->setId(1)
            ->setOrganizationCode('OFFICIAL_ORG')
            ->setParentId(0)
            ->setNodeType('group')
            ->setUsageType(null)
            ->setCode('purpose_group')
            ->setNameI18n(['zh_CN' => '用途与交付物', 'en_US' => 'Purpose']);

        $domainService = $this->createMock(SlidesTemplateTagDomainService::class);
        $domainService
            ->expects($this->once())
            ->method('queriesVisibleGroupsWithTagsByCategory')
            ->with(
                $this->callback(static fn (SlidesTemplateDataIsolation $actual): bool => $actual->isContainOfficialOrganization()
                    && $actual->getOrganizationCodes() === ['CURRENT_ORG', 'OFFICIAL_ORG']),
                'PPT-CATE-work'
            )
            ->willReturn([$group]);

        $service = new SlidesTemplateTagAppService($domainService);
        $this->assertSame([$group], $service->queriesGroups($dataIsolation, $request));
    }

    private function makeDataIsolation(string $organizationCode, array $officialOrganizationCodes): SlidesTemplateDataIsolation
    {
        /** @var SlidesTemplateDataIsolation $dataIsolation */
        $dataIsolation = (new ReflectionClass(SlidesTemplateDataIsolation::class))->newInstanceWithoutConstructor();
        $dataIsolation->setCurrentOrganizationCode($organizationCode);
        $dataIsolation->setCurrentUserId('user-1');
        $dataIsolation->setMagicId('magic-1');
        $dataIsolation->setEnabled(true);
        $dataIsolation->setContainOfficialOrganization(false);
        $dataIsolation->setOnlyOfficialOrganization(false);
        $dataIsolation->setOfficialOrganizationCodes($officialOrganizationCodes);
        return $dataIsolation;
    }
}

class TestPublicQuerySlidesTemplateTagGroupsRequest extends PublicQuerySlidesTemplateTagRequest
{
    public function __construct(
        private readonly ?string $categoryCode = null,
    ) {
    }

    public function getCategoryCode(): ?string
    {
        return $this->categoryCode;
    }
}
