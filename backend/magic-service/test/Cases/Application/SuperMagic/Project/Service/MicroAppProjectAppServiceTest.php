<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Project\Service;

use App\Application\SuperMagic\Common\Share\Service\ResourceShareAppService;
use App\Application\SuperMagic\Project\DTO\Request\MicroAppListRequestDTO;
use App\Application\SuperMagic\Project\DTO\Request\PublishMicroAppRequestDTO;
use App\Application\SuperMagic\Project\Service\MicroAppProjectAppService;
use App\Application\SuperMagic\Project\Service\MicroAppProjectResponseFormatter;
use App\Application\SuperMagic\Project\Service\MicroAppShareConfig;
use App\Application\SuperMagic\Project\Service\ProjectAppService;
use App\Application\SuperMagic\Project\Service\PublishedMicroAppResolver;
use App\Domain\Contact\Repository\Facade\MagicDepartmentUserRepositoryInterface;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\Provider\Service\ModelFilter\PackageFilterInterface;
use App\Domain\SuperMagic\Common\Share\Constant\ShareAccessType;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use App\Domain\SuperMagic\Common\Share\Service\ResourceShareDomainService;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Domain\SuperMagic\Project\Entity\ProjectEntity;
use App\Domain\SuperMagic\Project\Entity\ValueObject\MicroAppListScope;
use App\Domain\SuperMagic\Project\Entity\ValueObject\ProjectMode;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use App\Domain\SuperMagic\Project\Repository\Facade\ProjectRepositoryInterface;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\Domain\SuperMagic\Project\Service\ProjectMemberDomainService;
use App\Domain\SuperMagic\Workspace\Repository\Facade\WorkspaceRepositoryInterface;
use App\Infrastructure\SuperMagic\Utils\ShareUrlBuilder;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\SuperMagic\Common\Share\DTO\Request\CreateShareRequestDTO;
use App\Interfaces\SuperMagic\Common\Share\DTO\Response\ShareItemDTO;
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

        $this->setDatabaseContainer();

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

        $service = $this->createService(
            $microAppRepository,
            $projectRepository,
            $resourceShareAppService,
            $shareDomainService,
            $shareUrlBuilder,
            $responseFormatter,
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

    public function testResolvePublishedReturnsDisplayConfigFromShareRecord(): void
    {
        $record = (new MicroAppEntity())
            ->setId(1001)
            ->setResourceId('resource-1');
        $shareEntity = (new ResourceShareEntity())
            ->setShareCode('share-code-1')
            ->setExtra(['pure_mode' => true]);
        $publishedResolver = $this->createMock(PublishedMicroAppResolver::class);
        $publishedResolver->expects(self::once())
            ->method('findPublished')
            ->with(1001)
            ->willReturn([$record, $shareEntity]);
        $responseFormatter = $this->createMock(MicroAppProjectResponseFormatter::class);
        $responseFormatter->expects(self::once())
            ->method('formatPublishedResolution')
            ->with($record, $shareEntity)
            ->willReturn(['extra' => ['pure_mode' => true]]);

        $service = $this->createService(
            $this->createMock(MicroAppRepositoryInterface::class),
            $this->createMock(ProjectRepositoryInterface::class),
            $this->createMock(ResourceShareAppService::class),
            $this->createMock(ResourceShareDomainService::class),
            $this->createMock(ShareUrlBuilder::class),
            $responseFormatter,
            $publishedResolver,
        );

        self::assertSame(
            ['extra' => ['pure_mode' => true]],
            $service->resolvePublished(1001),
        );
    }

    public function testListReturnsProjectIdAndEffectiveUserRole(): void
    {
        $authorization = (new MagicUserAuthorization())
            ->setId('user-1')
            ->setOrganizationCode('org-1');
        $requestContext = $this->createMock(RequestContext::class);
        $requestContext->method('getUserAuthorization')->willReturn($authorization);

        $rows = [
            [
                'app_id' => 1001,
                'project_id' => 2001,
                'app_name' => 'Owned App',
                'app_description' => 'Owned description',
                'creator_id' => 'user-1',
                'cover_file_key' => null,
                'publish_status' => 'published',
                'updated_at' => '2026-08-28 10:00:00',
                'project_owner_id' => 'user-1',
                'organization_code' => 'org-1',
            ],
            [
                'app_id' => 1002,
                'project_id' => 2002,
                'app_name' => 'Managed App',
                'app_description' => 'Managed description',
                'creator_id' => 'user-2',
                'cover_file_key' => null,
                'publish_status' => 'unpublished',
                'updated_at' => null,
                'project_owner_id' => 'user-2',
                'organization_code' => 'org-1',
            ],
        ];

        $microAppRepository = $this->createMock(MicroAppRepositoryInterface::class);
        $microAppRepository->expects(self::once())
            ->method('paginateAccessible')
            ->with(
                'user-1',
                ['dept-1'],
                ['org-1'],
                MicroAppListScope::All,
                '',
                1,
                20,
            )
            ->willReturn(['total' => 2, 'list' => $rows]);

        $projectMemberDomainService = $this->createMock(ProjectMemberDomainService::class);
        $projectMemberDomainService->expects(self::once())
            ->method('getProjectIdsByCollaboratorTargets')
            ->with(['user-1', 'dept-1'])
            ->willReturn([]);
        $projectMemberDomainService->expects(self::once())
            ->method('getUserHighestRolesInProjects')
            ->with([2001, 2002], ['user-1', 'dept-1'])
            ->willReturn([2002 => 'manage']);

        $departmentRepository = $this->createMock(MagicDepartmentUserRepositoryInterface::class);
        $departmentRepository->expects(self::once())
            ->method('getDepartmentIdsByUserIds')
            ->willReturn(['user-1' => ['dept-1']]);

        $projectDomainService = $this->createMock(ProjectDomainService::class);
        $projectDomainService->expects(self::once())
            ->method('getOrganizationCodesByProjectIds')
            ->with([])
            ->willReturn([]);
        $packageFilterService = $this->createMock(PackageFilterInterface::class);
        $packageFilterService->expects(self::once())
            ->method('filterPaidOrganizations')
            ->with([])
            ->willReturn([]);

        $responseFormatter = $this->createMock(MicroAppProjectResponseFormatter::class);
        $responseFormatter->expects(self::once())
            ->method('resolveCoverUrls')
            ->with($rows)
            ->willReturn([]);
        $responseFormatter->method('coverUrlMapKey')
            ->willReturnCallback(static fn (array $row, string $coverKey): string =>
                (string) ($row['organization_code'] ?? '') . ':' . $coverKey
            );

        $service = $this->createService(
            $microAppRepository,
            $this->createMock(ProjectRepositoryInterface::class),
            $this->createMock(ResourceShareAppService::class),
            $this->createMock(ResourceShareDomainService::class),
            $this->createMock(ShareUrlBuilder::class),
            $responseFormatter,
            projectMemberDomainService: $projectMemberDomainService,
            departmentUserDomainService: new MagicDepartmentUserDomainService($departmentRepository),
            projectDomainService: $projectDomainService,
            packageFilterService: $packageFilterService,
        );

        self::assertSame(
            [
                'list' => [
                    [
                        'app_id' => '1001',
                        'project_id' => '2001',
                        'app_name' => 'Owned App',
                        'app_description' => 'Owned description',
                        'creator_id' => 'user-1',
                        'cover_url' => '',
                        'publish_status' => 'published',
                        'updated_at' => '2026-08-28 10:00:00',
                        'user_role' => 'owner',
                        'can_delete' => true,
                    ],
                    [
                        'app_id' => '1002',
                        'project_id' => '2002',
                        'app_name' => 'Managed App',
                        'app_description' => 'Managed description',
                        'creator_id' => 'user-2',
                        'cover_url' => '',
                        'publish_status' => 'unpublished',
                        'updated_at' => null,
                        'user_role' => 'manage',
                        'can_delete' => false,
                    ],
                ],
                'total' => 2,
                'page' => 1,
                'page_size' => 20,
            ],
            $service->list($requestContext, new MicroAppListRequestDTO()),
        );
    }

    private function setDatabaseContainer(): void
    {
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
    }

    private function createService(
        MicroAppRepositoryInterface $microAppRepository,
        ProjectRepositoryInterface $projectRepository,
        ResourceShareAppService $resourceShareAppService,
        ResourceShareDomainService $shareDomainService,
        ShareUrlBuilder $shareUrlBuilder,
        MicroAppProjectResponseFormatter $responseFormatter,
        ?PublishedMicroAppResolver $publishedResolver = null,
        ?ProjectMemberDomainService $projectMemberDomainService = null,
        ?MagicDepartmentUserDomainService $departmentUserDomainService = null,
        ?ProjectDomainService $projectDomainService = null,
        ?PackageFilterInterface $packageFilterService = null,
    ): TestableMicroAppProjectAppService {
        return new TestableMicroAppProjectAppService(
            $microAppRepository,
            $projectRepository,
            $this->createMock(WorkspaceRepositoryInterface::class),
            $resourceShareAppService,
            $shareDomainService,
            $shareUrlBuilder,
            $projectDomainService ?? $this->createMock(ProjectDomainService::class),
            $this->createMock(ProjectAppService::class),
            $projectMemberDomainService ?? $this->createMock(ProjectMemberDomainService::class),
            $departmentUserDomainService ?? new MagicDepartmentUserDomainService(
                $this->createMock(MagicDepartmentUserRepositoryInterface::class)
            ),
            $packageFilterService ?? $this->createMock(PackageFilterInterface::class),
            $this->createMock(EventDispatcherInterface::class),
            $publishedResolver ?? $this->createMock(PublishedMicroAppResolver::class),
            $responseFormatter,
            new MicroAppShareConfig(),
        );
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
