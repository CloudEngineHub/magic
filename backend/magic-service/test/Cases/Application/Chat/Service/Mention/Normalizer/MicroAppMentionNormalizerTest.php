<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Chat\Service\Mention\Normalizer;

use App\Application\Chat\Service\Mention\Normalizer\MicroAppMentionNormalizer;
use App\Application\SuperMagic\Project\Service\MicroAppProjectAppService;
use App\Application\SuperMagic\Project\Service\PublishedMicroAppResolver;
use App\Domain\SuperMagic\Common\Share\Constant\ShareAccessType;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * @internal
 */
class MicroAppMentionNormalizerTest extends TestCase
{
    public function testNormalizeFillsProjectIdForOrgShareWithoutMembership(): void
    {
        $share = (new ResourceShareEntity())
            ->setShareCode('share-org')
            ->setShareType(ShareAccessType::TeamShare->value)
            ->setShareRange('all');

        $normalizer = $this->createNormalizer(
            membershipException: new RuntimeException('access denied'),
            shareEntity: $share,
            canAccessShare: true,
        );

        $result = $normalizer->normalize(
            ['type' => 'micro_app', 'app_id' => '3001', 'app_name' => 'Org Shared App'],
            $this->createDataIsolation(),
        );

        self::assertSame('3001', $result['app_id']);
        self::assertSame('Org Shared App', $result['app_name']);
        self::assertSame('4001', $result['project_id']);
    }

    public function testNormalizeDoesNotEnrichPasswordProtectedShareWithoutMembership(): void
    {
        $share = (new ResourceShareEntity())
            ->setShareCode('share-password')
            ->setShareType(ShareAccessType::PasswordProtected->value);

        $normalizer = $this->createNormalizer(
            membershipException: new RuntimeException('access denied'),
            shareEntity: $share,
            canAccessShare: true,
        );

        $item = ['type' => 'micro_app', 'app_id' => '3001', 'app_name' => 'Password App'];
        self::assertSame($item, $normalizer->normalize($item, $this->createDataIsolation()));
    }

    private function createDataIsolation(): BaseDataIsolation
    {
        $dataIsolation = $this->createMock(BaseDataIsolation::class);
        $dataIsolation->method('getCurrentUserId')->willReturn('user-1');
        $dataIsolation->method('getCurrentOrganizationCode')->willReturn('org-1');

        return $dataIsolation;
    }

    private function createNormalizer(
        RuntimeException $membershipException,
        ResourceShareEntity $shareEntity,
        bool $canAccessShare,
    ): MicroAppMentionNormalizer {
        $record = (new MicroAppEntity())
            ->setId(3001)
            ->setProjectId(4001)
            ->setResourceId('resource-1')
            ->setPublishStatus('published');

        $microAppRepository = $this->createMock(MicroAppRepositoryInterface::class);
        $microAppRepository->method('findById')->with(3001)->willReturn($record);

        $projectAppService = $this->createMock(MicroAppProjectAppService::class);
        $projectAppService->method('getAccessibleProject')->willThrowException($membershipException);

        $resolver = $this->createMock(PublishedMicroAppResolver::class);
        $resolver->method('findPublished')->with(3001)->willReturn([$record, $shareEntity]);
        $resolver->method('canAccessShare')->willReturn($canAccessShare);
        $resolver->method('getProjectName')->willReturn('');

        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($this->createMock(LoggerInterface::class));

        return new MicroAppMentionNormalizer(
            $loggerFactory,
            $microAppRepository,
            $projectAppService,
            $resolver,
        );
    }
}
