<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\SuperAgent\Service;

use App\Domain\Contact\Repository\Facade\MagicDepartmentUserRepositoryInterface;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\Provider\Service\ModelFilter\PackageFilterInterface;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\SuperMagic\Application\Share\Service\ResourceShareAppService;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishMicroAppRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppProjectAppService;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppProjectResponseFormatter;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppShareConfig;
use Dtyq\SuperMagic\Application\SuperAgent\Service\ProjectAppService;
use Dtyq\SuperMagic\Application\SuperAgent\Service\PublishedMicroAppResolver;
use Dtyq\SuperMagic\Domain\Share\Constant\ShareAccessType;
use Dtyq\SuperMagic\Domain\Share\Entity\ResourceShareEntity;
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
use Dtyq\SuperMagic\Interfaces\Share\DTO\Request\CreateShareRequestDTO;
use Dtyq\SuperMagic\Interfaces\Share\DTO\Response\ShareItemDTO;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ValidatorInterface;
use Hyperf\Database\ConnectionInterface;
use Hyperf\Database\ConnectionResolverInterface;
use Hyperf\DbConnection\Db;
use Hyperf\Validation\Contract\ValidatorFactoryInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use ReflectionProperty;
use RuntimeException;

/**
 * @internal
 */
class MicroAppProjectAppServiceTest extends TestCase
{
    private ?ContainerInterface $previousContainer = null;

    protected function tearDown(): void
    {
        if ($this->previousContainer !== null) {
            ApplicationContext::setContainer($this->previousContainer);
        } elseif (ApplicationContext::hasContainer()) {
            $containerProperty = new ReflectionProperty(ApplicationContext::class, 'container');
            $containerProperty->setAccessible(true);
            $containerProperty->setValue(null, null);
        }

        parent::tearDown();
    }

    public function testPublishPassesPureModeToTheCommonShareRecord(): void
    {
        $appId = 1001;
        $projectId = 2001;
        $authorization = (new MagicUserAuthorization())
            ->setId('user-1')
            ->setOrganizationCode('org-1');
        $requestContext = $this->createMock(RequestContext::class);
        $requestContext->method('getUserAuthorization')->willReturn($authorization);

        $record = (new MicroAppEntity())
            ->setId($appId)
            ->setProjectId($projectId)
            ->setResourceId('resource-1')
            ->setOrganizationCode('org-1');
        $project = (new ProjectEntity())
            ->setId($projectId)
            ->setUserId('user-1')
            ->setUserOrganizationCode('org-1')
            ->setProjectName('Demo App')
            ->setProjectMode(ProjectMode::MICRO_APP->value);

        $connection = $this->createMock(ConnectionInterface::class);
        $connection->expects(self::once())->method('beginTransaction');
        $connection->expects(self::once())->method('commit');
        $resolver = $this->createMock(ConnectionResolverInterface::class);
        $resolver->method('connection')->willReturn($connection);
        $validator = $this->createMock(ValidatorInterface::class);
        $validator->method('fails')->willReturn(false);
        $validatorFactory = $this->createMock(ValidatorFactoryInterface::class);
        $validatorFactory->method('make')->willReturn($validator);
        $this->previousContainer = ApplicationContext::hasContainer()
            ? ApplicationContext::getContainer()
            : null;
        ApplicationContext::setContainer(new class($resolver, $validatorFactory) implements ContainerInterface {
            public function __construct(
                private readonly ConnectionResolverInterface $resolver,
                private readonly ValidatorFactoryInterface $validatorFactory,
            ) {
            }

            public function get(string $id): mixed
            {
                return match ($id) {
                    Db::class => new Db($this),
                    ConnectionResolverInterface::class => $this->resolver,
                    PhpSerializerPacker::class => new PhpSerializerPacker(),
                    ValidatorFactoryInterface::class => $this->validatorFactory,
                    default => throw new RuntimeException("Unsupported test dependency: {$id}"),
                };
            }

            public function has(string $id): bool
            {
                return in_array($id, [
                    Db::class,
                    ConnectionResolverInterface::class,
                    PhpSerializerPacker::class,
                    ValidatorFactoryInterface::class,
                ], true);
            }
        });

        $microAppRepository = $this->createMock(MicroAppRepositoryInterface::class);
        $microAppRepository->method('findById')->with($appId)->willReturn($record);
        $microAppRepository->expects(self::once())
            ->method('save')
            ->with($record)
            ->willReturn($record);
        $projectRepository = $this->createMock(ProjectRepositoryInterface::class);
        $projectRepository->method('findById')->with($projectId)->willReturn($project);

        $shareDomainService = $this->createMock(ResourceShareDomainService::class);
        $shareDomainService->expects(self::once())
            ->method('getShareByResourceIdWithTrashed')
            ->with('resource-1')
            ->willReturn((new ResourceShareEntity())->setExtra(['allow_copy_project_files' => true]));
        $shareItem = ShareItemDTO::fromArray([
            'id' => 'share-1',
            'share_code' => 'share-code-1',
            'extra' => ['allow_copy_project_files' => true, 'pure_mode' => true],
        ]);
        $resourceShareAppService = $this->createMock(ResourceShareAppService::class);
        $resourceShareAppService->expects(self::once())
            ->method('createShare')
            ->with(
                $authorization,
                self::callback(static function (CreateShareRequestDTO $dto): bool {
                    self::assertTrue($dto->hasField('extra'));
                    self::assertSame([
                        'allow_copy_project_files' => true,
                        'pure_mode' => true,
                    ], $dto->getExtra());
                    return true;
                }),
            )
            ->willReturn($shareItem);

        $shareUrlBuilder = $this->createMock(ShareUrlBuilder::class);
        $shareUrlBuilder->method('buildMicroAppShareUrl')
            ->with((string) $appId)
            ->willReturn('https://example.com/micro-app/1001');
        $responseFormatter = $this->createMock(MicroAppProjectResponseFormatter::class);
        $responseFormatter->expects(self::once())
            ->method('formatPublishRecord')
            ->with($record, 'Demo App', $shareItem->extra)
            ->willReturn(['extra' => ['pure_mode' => true]]);

        $service = new TestableMicroAppProjectAppService(
            $microAppRepository,
            $projectRepository,
            $this->createMock(WorkspaceRepositoryInterface::class),
            $resourceShareAppService,
            $shareDomainService,
            $shareUrlBuilder,
            $this->createMock(ProjectDomainService::class),
            $this->createMock(ProjectAppService::class),
            $this->createMock(ProjectMemberDomainService::class),
            new MagicDepartmentUserDomainService(
                $this->createMock(MagicDepartmentUserRepositoryInterface::class)
            ),
            $this->createMock(PackageFilterInterface::class),
            $this->createMock(EventDispatcherInterface::class),
            $this->createMock(PublishedMicroAppResolver::class),
            $responseFormatter,
            new MicroAppShareConfig(),
        );
        $requestDTO = new PublishMicroAppRequestDTO([
            'app_name' => 'Demo App',
            'share_type' => ShareAccessType::Internet->value,
            'extra' => ['pure_mode' => true],
        ]);

        self::assertSame(
            ['extra' => ['pure_mode' => true]],
            $service->publish($requestContext, $appId, $requestDTO),
        );
    }

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
            $this->createMock(EventDispatcherInterface::class),
            $this->createMock(PublishedMicroAppResolver::class),
            $this->createMock(MicroAppProjectResponseFormatter::class),
            new MicroAppShareConfig(),
        );

        self::assertSame([
            'app_id' => (string) $appId,
            'project_id' => (string) $projectId,
            'deleted' => true,
        ], $service->delete($requestContext, $appId));
    }
}

final class TestableMicroAppProjectAppService extends MicroAppProjectAppService
{
    public function getAccessibleProjectWithManager(
        int $projectId,
        string $userId,
        string $organizationCode,
    ): ProjectEntity {
        return new ProjectEntity();
    }
}
