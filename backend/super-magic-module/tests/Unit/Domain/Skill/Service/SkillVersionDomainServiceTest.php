<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Tests\Unit\Domain\Skill\Service;

use Dtyq\SuperMagic\Domain\Skill\Entity\SkillVersionEntity;
use Dtyq\SuperMagic\Domain\Skill\Entity\ValueObject\PublishStatus;
use Dtyq\SuperMagic\Domain\Skill\Entity\ValueObject\PublishTargetType;
use Dtyq\SuperMagic\Domain\Skill\Entity\ValueObject\ReviewStatus;
use Dtyq\SuperMagic\Domain\Skill\Entity\ValueObject\SkillDataIsolation;
use Dtyq\SuperMagic\Domain\Skill\Repository\Facade\SkillRepositoryInterface;
use Dtyq\SuperMagic\Domain\Skill\Repository\Facade\SkillVersionRepositoryInterface;
use Dtyq\SuperMagic\Domain\Skill\Repository\Facade\UserSkillRepositoryInterface;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class SkillVersionDomainServiceTest extends TestCase
{
    public function testPlatformRejectionDisablesOrganizationIsolationBeforeSaving(): void
    {
        $version = new SkillVersionEntity([
            'id' => 898175322235977729,
            'code' => 'skill-code',
            'organization_code' => 'source-org',
            'creator_id' => 'creator',
            'publish_status' => PublishStatus::UNPUBLISHED->value,
            'review_status' => ReviewStatus::UNDER_REVIEW->value,
            'publish_target_type' => PublishTargetType::MARKET->value,
            'package_name' => 'package',
            'version' => '1.0.0',
        ]);

        $versionRepository = $this->createMock(SkillVersionRepositoryInterface::class);
        $versionRepository->expects(self::once())
            ->method('findPendingReviewById')
            ->with($version->getId())
            ->willReturn($version);
        $versionRepository->expects(self::once())
            ->method('save')
            ->with(
                self::callback(static fn (SkillDataIsolation $dataIsolation): bool => ! $dataIsolation->isEnable()),
                self::callback(static fn (SkillVersionEntity $savedVersion): bool => $savedVersion->getReviewStatus() === ReviewStatus::REJECTED),
            )
            ->willReturn($version);

        $service = new SkillVersionDomainService(
            $this->createMock(SkillRepositoryInterface::class),
            $versionRepository,
            $this->createMock(UserSkillRepositoryInterface::class),
            $this->createMock(SkillMarketDomainService::class),
        );

        $service->reviewSkillVersion(
            SkillDataIsolation::create('reviewer-org'),
            $version->getId(),
            ReviewStatus::REJECTED->value,
        );

        self::assertSame(ReviewStatus::REJECTED, $version->getReviewStatus());
    }
}
