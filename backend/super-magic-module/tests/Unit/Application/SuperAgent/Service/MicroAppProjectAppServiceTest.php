<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\SuperAgent\Service;

use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\Contact\Repository\Facade\MagicDepartmentUserRepositoryInterface;
use App\Domain\File\Repository\Persistence\Facade\CloudFileRepositoryInterface;
use App\Domain\File\Service\FileDomainService;
use App\Domain\Provider\Service\ModelFilter\PackageFilterInterface;
use App\Infrastructure\Util\Context\RequestContext;
use Dtyq\SuperMagic\Application\Share\Service\ResourceShareAppService;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppProjectAppService;
use Dtyq\SuperMagic\Application\SuperAgent\Service\ProjectAppService;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\ProjectMode;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\WorkspaceRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\ProjectMemberDomainService;
use Dtyq\SuperMagic\Infrastructure\Utils\ShareUrlBuilder;
use PHPUnit\Framework\TestCase;
use Psr\EventDispatcher\EventDispatcherInterface;

/**
 * @internal
 */
class MicroAppProjectAppServiceTest extends TestCase
{
    public function testDeleteResolvesAppIdAndDelegatesToProjectDeletion(): void
    {
        $appId = 1001;
        $projectId = 2001;
        $requestContext = $this->createMock(RequestContext::class);
        $microAppRepository = $this->createMock(MicroAppRepositoryInterface::class);
        $projectRepository = $this->createMock(ProjectRepositoryInterface::class);
        $projectAppService = $this->createMock(ProjectAppService::class);

        $microAppRepository->expects($this->once())
            ->method('findById')
            ->with($appId)
            ->willReturn((new MicroAppEntity())->setId($appId)->setProjectId($projectId));
        $projectRepository->expects($this->once())
            ->method('findById')
            ->with($projectId)
            ->willReturn(
                (new ProjectEntity())
                    ->setId($projectId)
                    ->setProjectMode(ProjectMode::MICRO_APP->value)
            );
        $projectAppService->expects($this->once())
            ->method('deleteProject')
            ->with($requestContext, $projectId)
            ->willReturn(true);

        $service = new MicroAppProjectAppService(
            $microAppRepository,
            $projectRepository,
            $this->createMock(WorkspaceRepositoryInterface::class),
            $this->createMock(ResourceShareAppService::class),
            $this->createMock(ResourceShareDomainService::class),
            $this->createMock(ShareUrlBuilder::class),
            $this->createMock(ProjectDomainService::class),
            $projectAppService,
            $this->createMock(ProjectMemberDomainService::class),
            new MagicDepartmentUserDomainService(
                $this->createMock(MagicDepartmentUserRepositoryInterface::class)
            ),
            $this->createMock(PackageFilterInterface::class),
            new FileDomainService($this->createMock(CloudFileRepositoryInterface::class)),
            $this->createMock(EventDispatcherInterface::class),
        );

        self::assertSame([
            'app_id' => (string) $appId,
            'project_id' => (string) $projectId,
            'deleted' => true,
        ], $service->delete($requestContext, $appId));
    }
}
