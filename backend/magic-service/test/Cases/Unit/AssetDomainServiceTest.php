<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Unit;

use App\Application\Asset\Service\AdminAssetAppService;
use App\Domain\Asset\Contract\AssetProviderInterface;
use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\ProviderAssetEntity;
use App\Domain\Asset\Entity\ValueObject\AssetSyncStatus;
use App\Domain\Asset\Entity\ValueObject\Query\AssetQuery;
use App\Domain\Asset\Repository\Facade\AssetAgreementRepositoryInterface;
use App\Domain\Asset\Repository\Facade\AssetProviderAssetRepositoryInterface;
use App\Domain\Asset\Repository\Facade\AssetRepositoryInterface;
use App\Domain\Asset\Repository\Persistence\Model\AssetModel;
use App\Domain\Asset\Repository\Persistence\Model\AssetProviderAssetModel;
use App\Domain\Asset\Service\AssetDomainService;
use App\Domain\Contact\Repository\Facade\MagicDepartmentUserRepositoryInterface;
use App\Domain\Permission\Repository\Facade\ResourceVisibilityRepositoryInterface;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use App\ErrorCode\AssetErrorCode;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\Asset\Assembler\AssetAssembler;
use App\Interfaces\Asset\DTO\Request\CreateAssetRequestDTO;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Log\AbstractLogger;
use Psr\Log\LoggerInterface;
use ReflectionMethod;
use ReflectionParameter;
use RuntimeException;

/**
 * @internal
 */
final class AssetDomainServiceTest extends TestCase
{
    private ?ContainerInterface $containerBeforeTest = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (ApplicationContext::hasContainer()) {
            $this->containerBeforeTest = ApplicationContext::getContainer();
        }
        ApplicationContext::setContainer(new class implements ContainerInterface {
            public function get(string $id): object
            {
                if ($id === TranslatorInterface::class) {
                    return new class implements TranslatorInterface {
                        public function trans(string $key, array $replace = [], ?string $locale = null): string
                        {
                            return $key;
                        }

                        public function transChoice(string $key, mixed $number, array $replace = [], ?string $locale = null): string
                        {
                            return $key;
                        }

                        public function getLocale(): string
                        {
                            return 'zh_CN';
                        }

                        public function setLocale(string $locale): void
                        {
                        }
                    };
                }
                if ($id === ConfigInterface::class) {
                    return new class implements ConfigInterface {
                        public function get(string $key, mixed $default = null): mixed
                        {
                            return $key === 'error_message'
                                ? [
                                    'exception_class' => BusinessException::class,
                                    'error_code_mapper' => [AssetErrorCode::class => [48000, 48999]],
                                ]
                                : $default;
                        }

                        public function has(string $keys): bool
                        {
                            return $keys === 'error_message';
                        }

                        public function set(string $key, mixed $value): void
                        {
                        }
                    };
                }
                if ($id === EventDispatcherInterface::class) {
                    // Hyperf 模型在构造时会 boot 事件，需要容器给出事件派发器。
                    return new class implements EventDispatcherInterface {
                        public function dispatch(object $event): object
                        {
                            return $event;
                        }
                    };
                }
                return new class {};
            }

            public function has(string $id): bool
            {
                return in_array($id, [ConfigInterface::class, TranslatorInterface::class, EventDispatcherInterface::class], true);
            }
        });
    }

    protected function tearDown(): void
    {
        if ($this->containerBeforeTest !== null) {
            ApplicationContext::setContainer($this->containerBeforeTest);
        }
        parent::tearDown();
    }

    public function testQueriesReturnEntitiesThatCanBeAssembled(): void
    {
        $model = $this->assetModel(['id' => 1, 'organization_code' => 'org-a', 'user_id' => 'user-a']);
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->expects(self::once())->method('queries')->willReturn([
            'total' => 1,
            'list' => [new AssetEntity($model->toArray())],
        ]);

        $result = $this->domainService($repository)->queries(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetQuery(),
            new Page(1, 10),
        );

        self::assertInstanceOf(AssetEntity::class, $result['list'][0]);
        $response = AssetAssembler::createList($result['list'], new Page(1, 10), 1)->toArray();
        self::assertCount(1, $response['list']);
    }

    public function testAssetEntityContainsOnlyMagicAssetsFields(): void
    {
        $asset = new AssetEntity([
            'file_key' => 'asset.png',
            'agreement_version' => '1.0',
            'provider_asset_id' => 'provider-1',
        ]);

        self::assertArrayNotHasKey('agreement_version', $asset->toArray());
        self::assertArrayNotHasKey('provider_asset_id', $asset->toArray());
        self::assertArrayNotHasKey('provider_group_id', $asset->toArray());
        self::assertArrayNotHasKey('provider_status', $asset->toArray());
    }

    public function testLocalSaveOnlyTakesIsolationAndAsset(): void
    {
        $method = new ReflectionMethod(AssetDomainService::class, 'saveLocal');
        $names = array_map(
            static fn (ReflectionParameter $parameter): string => $parameter->getName(),
            $method->getParameters(),
        );

        // 落库阶段不再接收第三方映射：映射改由同步阶段在拿到凭证后各自写入。
        self::assertSame(['dataIsolation', 'asset', 'syncStatus'], $names);
    }

    public function testOfficialAssetDetailIsReadableWithoutUserOwnerFilter(): void
    {
        $model = $this->assetModel([
            'id' => 2,
            'organization_code' => 'official',
            'user_id' => null,
            'status' => 1,
        ]);
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->expects(self::once())
            ->method('findById')
            ->with(self::isInstanceOf(AssetDataIsolation::class), 2)
            ->willReturn(new AssetEntity($model->toArray()));

        $result = $this->domainService($repository)->find(
            $this->dataIsolation('org-a', 'user-a', ['org-a', 'official']),
            2,
        );

        self::assertInstanceOf(AssetEntity::class, $result);
        self::assertSame('official', $result->getOrganizationCode());
    }

    public function testUnsyncedAssetDetailIsNotReadable(): void
    {
        $model = $this->assetModel([
            'id' => 5,
            'sync_status' => AssetSyncStatus::FAILED->value,
        ]);
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity($model->toArray()));

        // 同步失败的资产对用户不可见，与列表过滤保持同一条规则。
        self::assertNull($this->domainService($repository)->find(
            $this->dataIsolation('org-a', 'user-a', ['org-a', 'official']),
            5,
        ));
    }

    public function testOtherUsersPersonalAssetIsNotReadable(): void
    {
        $model = $this->assetModel([
            'id' => 4,
            'organization_code' => 'org-a',
            'user_id' => 'user-b',
        ]);
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity($model->toArray()));

        self::assertNull($this->domainService($repository)->find(
            $this->dataIsolation('org-a', 'user-a', ['org-a', 'official']),
            4,
        ));
    }

    public function testGrantedSharedAssetDetailIsReadable(): void
    {
        $model = $this->assetModel([
            'id' => 4,
            'organization_code' => 'org-a',
            'user_id' => 'user-b',
        ]);
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity($model->toArray()));

        // 可见范围已确认当前用户在授权列表里（团队分享），别人的个人素材同样可以看详情。
        $result = $this->domainService($repository)->find(
            $this->dataIsolation('org-a', 'user-a', ['org-a', 'official']),
            4,
            true,
        );

        self::assertInstanceOf(AssetEntity::class, $result);
        self::assertSame('user-b', $result->getUserId());
    }

    public function testDisabledOfficialAssetIsNotReadable(): void
    {
        $model = $this->assetModel([
            'id' => 5,
            'organization_code' => 'official',
            'user_id' => null,
            'status' => 0,
        ]);
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity($model->toArray()));

        self::assertNull($this->domainService($repository)->find(
            $this->dataIsolation('org-a', 'user-a', ['org-a', 'official']),
            5,
        ));
    }

    public function testPublicDeleteDoesNotFilterByAdministratorUserId(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->expects(self::once())->method('findById')->with(
            self::isInstanceOf(AssetDataIsolation::class),
            3,
        )->willReturn(new AssetEntity($this->assetModel([
            'id' => 3,
            'organization_code' => 'official',
            'user_id' => null,
        ])->toArray()));
        $repository->expects(self::once())
            ->method('delete')
            ->with(
                self::isInstanceOf(AssetDataIsolation::class),
                self::callback(static fn (AssetEntity $asset): bool => $asset->getId() === 3),
            )
            ->willReturn(true);
        $service = new AssetDomainService(
            $repository,
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );

        self::assertTrue($service->deletePublic(
            $this->dataIsolation('official', 'admin-a', ['official']),
            3,
        ));
    }

    public function testPublicUpdateDoesNotModifyPersonalAsset(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->expects(self::once())->method('findById')->with(
            self::isInstanceOf(AssetDataIsolation::class),
            7,
        )->willReturn(new AssetEntity($this->assetModel([
            'id' => 7,
            'organization_code' => 'official',
            'user_id' => 'user-a',
        ])->toArray()));
        $repository->expects(self::never())->method('update');
        $service = new AssetDomainService(
            $repository,
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );

        self::assertNull($service->updatePublic(
            $this->dataIsolation('official', 'admin-a', ['official']),
            new AssetEntity(['id' => 7, 'name_i18n' => ['default' => 'updated']]),
        ));
    }

    public function testAdminAssetManagementRequiresOfficialOrganization(): void
    {
        $domainService = $this->createMock(AssetDomainService::class);
        $domainService->expects(self::never())->method('createPublic');
        $request = $this->createMock(CreateAssetRequestDTO::class);
        $service = new AdminAssetAppService(
            $domainService,
            $this->visibilityDomainService(),
        );

        $this->expectException(BusinessException::class);
        $service->createPublicAsset(
            $this->dataIsolation('org-a', 'admin-a', ['org-a']),
            $request,
        );
    }

    public function testComplianceTimeoutMarksAssetFailedWithoutRecycling(): void
    {
        $logger = $this->collectingLogger();
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->willReturn(['provider_group_id' => 'group-default']);
        $provider->expects(self::once())
            ->method('createAsset')
            ->willReturn(['provider_asset_id' => 'asset-timeout', 'provider_status' => 'PROCESSING']);
        // 回查始终没有终态，直到触到上限。
        $provider->method('getAssetStatus')->willReturn([
            'provider_asset_id' => 'asset-timeout',
            'provider_status' => 'PROCESSING',
        ]);
        // 超时不回收：素材可能仍在第三方审核，删掉会打断审核流程。
        $provider->expects(self::never())->method('deleteAsset');
        $provider->expects(self::never())->method('deleteAssetGroup');

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('saveMapping')->willReturn($this->createMock(AssetProviderAssetModel::class));

        $syncStatuses = [];
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset): AssetEntity {
                self::assertSame(AssetSyncStatus::PENDING, $asset->getSyncStatus());
                $asset->setId(51);
                return $asset;
            }
        );
        $assets->method('update')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$syncStatuses): AssetEntity {
                $syncStatuses[] = $asset->getSyncStatus();
                return $asset;
            }
        );

        try {
            $this->serviceWithFakedPolling($assets, $provider, $providerAssets, $logger, 1)->createPersonal(
                $this->dataIsolation('org-a', 'user-a', ['org-a']),
                new AssetEntity(['file_key' => 'asset.png']),
            );
            self::fail('合规回查超时必须抛出 COMPLIANCE_TIMEOUT');
        } catch (BusinessException $exception) {
            self::assertSame(AssetErrorCode::COMPLIANCE_TIMEOUT->value, $exception->getCode());
        }

        // 先落库、再同步、失败只回写状态：资产不被回滚删除，远程资源也不回收。
        self::assertSame([AssetSyncStatus::SYNCING, AssetSyncStatus::FAILED], $syncStatuses);
        self::assertNotNull($this->findLogRecord($logger, '第三方素材合规回查超时'));
    }

    public function testPersonalAssetCreationRequiresAcceptedAgreement(): void
    {
        $agreement = $this->createMock(AssetAgreementRepositoryInterface::class);
        $agreement->expects(self::once())->method('hasAccepted')->willReturn(false);
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->expects(self::never())->method('createAsset');

        $service = new AssetDomainService(
            $this->createMock(AssetRepositoryInterface::class),
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $agreement,
            $provider,
        );

        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(AssetErrorCode::AGREEMENT_REQUIRED->value);
        $service->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'asset.png']),
        );
    }

    public function testSaveToLibraryPersistsAsSyncedWithoutProviderSync(): void
    {
        $persisted = null;
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$persisted): AssetEntity {
                $persisted = $asset;
                return $asset;
            }
        );
        // 保存到素材库不碰第三方：不建组、不建素材、也不要求先签素材协议。
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->expects(self::never())->method('createAsset');
        $provider->expects(self::never())->method('createAssetGroup');
        $agreement = $this->createMock(AssetAgreementRepositoryInterface::class);
        $agreement->expects(self::never())->method('hasAccepted');

        $service = new AssetDomainService(
            $assets,
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $agreement,
            $provider,
        );

        $result = $service->saveToLibrary(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png']),
        );

        self::assertTrue($result->getSyncStatus()->isSynced());
        self::assertSame('user-a', $result->getUserId());
        self::assertSame('org-a', $result->getOrganizationCode());
        self::assertNotNull($persisted);
        self::assertTrue($persisted->getSyncStatus()->isSynced());
    }

    public function testSigningAlreadyAcceptedAgreementIsIdempotent(): void
    {
        $agreement = $this->createMock(AssetAgreementRepositoryInterface::class);
        $agreement->expects(self::once())->method('hasAccepted')->willReturn(true);
        $agreement->expects(self::never())->method('markAccepted');

        $service = new AssetDomainService(
            $this->createMock(AssetRepositoryInterface::class),
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $agreement,
            $this->createMock(AssetProviderInterface::class),
        );

        $service->signAgreement($this->dataIsolation('org-a', 'user-a', ['org-a']));
    }

    public function testAssetIsPersistedBeforeCallingProvider(): void
    {
        $calls = [];
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$calls): AssetEntity {
                $calls[] = 'save';
                $asset->setId(61);
                return $asset;
            }
        );
        $assets->method('update')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$calls): AssetEntity {
                $calls[] = 'update';
                return $asset;
            }
        );

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())->method('createAssetGroup')->willReturnCallback(
            function () use (&$calls): array {
                $calls[] = 'createAssetGroup';
                return ['provider_group_id' => 'group-61'];
            }
        );
        $provider->expects(self::once())->method('createAsset')->willReturnCallback(
            function () use (&$calls): array {
                $calls[] = 'createAsset';
                return ['provider_asset_id' => 'asset-61', 'provider_status' => 'ACTIVE'];
            }
        );

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('saveMapping')->willReturn($this->createMock(AssetProviderAssetModel::class));

        $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png']),
        );

        // 本地落库必须早于任何第三方调用：这是「远程已建、本地没落」窗口消失的前提。
        $saveAt = array_search('save', $calls, true);
        $groupAt = array_search('createAssetGroup', $calls, true);
        $assetAt = array_search('createAsset', $calls, true);
        self::assertIsInt($saveAt);
        self::assertIsInt($groupAt);
        self::assertIsInt($assetAt);
        self::assertTrue($saveAt < $groupAt, '本地落库必须早于第三方建组');
        self::assertTrue($groupAt < $assetAt, '素材必须在素材组之后创建');
    }

    public function testProviderGroupCredentialIsPersistedBeforeAssetCreation(): void
    {
        $sequence = [];
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->willReturnCallback(function () use (&$sequence): array {
                $sequence[] = 'createAssetGroup';
                return ['provider_group_id' => 'group-71'];
            });
        $provider->expects(self::once())
            ->method('createAsset')
            ->willReturnCallback(function () use (&$sequence): array {
                $sequence[] = 'createAsset';
                return ['provider_asset_id' => 'asset-71', 'provider_status' => 'ACTIVE'];
            });

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        // 两次写同一行：先只带组凭证，再由素材凭证 upsert 补齐。
        $persistedAssetIds = [];
        $providerAssets->expects(self::exactly(2))->method('saveMapping')->willReturnCallback(
            function (AssetDataIsolation $isolation, ProviderAssetEntity $mapping) use (&$sequence, &$persistedAssetIds): AssetProviderAssetModel {
                $sequence[] = $mapping->getProviderAssetId() === '' ? 'persistGroup' : 'persistAsset';
                $persistedAssetIds[] = $mapping->getAssetId();
                return $this->createMock(AssetProviderAssetModel::class);
            }
        );

        $this->serviceWithFakedPolling($this->savingAssets(71), $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png']),
        );

        // 组凭证必须在素材创建之前落库，否则中途失败就再也追不回这个组。
        self::assertSame(['createAssetGroup', 'persistGroup', 'createAsset', 'persistAsset'], $sequence);
        // 专属素材组不再单独占一行：组与素材的凭证都挂在素材自己的映射行上。
        self::assertSame([71, 71], $persistedAssetIds);
    }

    public function testAssetGroupCredentialPersistFailureMarksAssetFailed(): void
    {
        $syncStatuses = [];
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset): AssetEntity {
                $asset->setId(81);
                return $asset;
            }
        );
        $assets->method('update')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$syncStatuses): AssetEntity {
                $syncStatuses[] = $asset->getSyncStatus();
                return $asset;
            }
        );

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->willReturn(['provider_group_id' => 'group-99']);
        // 素材不会在组凭证缺失的情况下继续创建。
        $provider->expects(self::never())->method('createAsset');
        // 凭证没写进去也不回收：远程建出来的组已经没有本地记录可依据，删与不删都是风险，交给人工。
        $provider->expects(self::never())->method('deleteAsset');
        $provider->expects(self::never())->method('deleteAssetGroup');

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->expects(self::once())
            ->method('saveMapping')
            ->willThrowException(new RuntimeException('映射表不可用'));

        try {
            $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
                $this->dataIsolation('org-a', 'user-a', ['org-a']),
                new AssetEntity(['file_key' => 'a.png']),
            );
            self::fail('专属素材组凭证写入失败必须向上抛出');
        } catch (RuntimeException $exception) {
            self::assertSame('映射表不可用', $exception->getMessage());
        }

        // 资产留在库里并标记失败：列表按同步状态过滤，用户看不到，但失败原因可查。
        self::assertSame([AssetSyncStatus::SYNCING, AssetSyncStatus::FAILED], $syncStatuses);
    }

    public function testProviderAssetResponseWithoutIdMarksAssetFailed(): void
    {
        $syncStatuses = [];
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset): AssetEntity {
                $asset->setId(82);
                return $asset;
            }
        );
        $assets->method('update')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$syncStatuses): AssetEntity {
                $syncStatuses[] = $asset->getSyncStatus();
                return $asset;
            }
        );

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->willReturn(['provider_group_id' => 'group-orphan']);
        // 响应里没有素材 ID，无从登记映射。
        $provider->expects(self::once())
            ->method('createAsset')
            ->willReturn(['provider_status' => 'ACTIVE']);

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        // 只写了专属素材组那一行：拿不到素材 ID 就抛错，不会再补写素材凭证。
        $providerAssets->expects(self::once())
            ->method('saveMapping')
            ->willReturn($this->createMock(AssetProviderAssetModel::class));

        try {
            $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
                $this->dataIsolation('org-a', 'user-a', ['org-a']),
                new AssetEntity(['file_key' => 'a.png']),
            );
            self::fail('第三方没有返回素材 ID 时必须抛出 PROVIDER_RESPONSE_INVALID');
        } catch (BusinessException $exception) {
            self::assertSame(AssetErrorCode::PROVIDER_RESPONSE_INVALID->value, $exception->getCode());
        }

        self::assertSame([AssetSyncStatus::SYNCING, AssetSyncStatus::FAILED], $syncStatuses);
    }

    public function testUnverifiableProviderStatusKeepsPollingUntilTimeout(): void
    {
        $logger = $this->collectingLogger();
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->willReturn(['provider_group_id' => 'group-default']);
        $provider->expects(self::once())
            ->method('createAsset')
            ->willReturn(['provider_asset_id' => 'asset-unknown', 'provider_status' => 'PROCESSING']);
        // 回查本身也抛异常：应当继续等，而不是把这条资产判死。
        $provider->method('getAssetStatus')->willThrowException(new RuntimeException('回查超时'));
        $provider->expects(self::never())->method('deleteAsset');
        $provider->expects(self::never())->method('deleteAssetGroup');

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('saveMapping')->willReturn($this->createMock(AssetProviderAssetModel::class));

        try {
            $this->serviceWithFakedPolling($this->savingAssets(91), $provider, $providerAssets, $logger, 3)->createPersonal(
                $this->dataIsolation('org-a', 'user-a', ['org-a']),
                new AssetEntity(['file_key' => 'a.png']),
            );
            self::fail('回查始终没有结论时必须抛出 COMPLIANCE_TIMEOUT');
        } catch (BusinessException $exception) {
            self::assertSame(AssetErrorCode::COMPLIANCE_TIMEOUT->value, $exception->getCode());
        }

        self::assertNotNull($this->findLogRecord($logger, '第三方素材状态回查失败，继续等待'));
        self::assertNotNull($this->findLogRecord($logger, '第三方素材合规回查超时'));
    }

    public function testFailedComplianceMarksAssetFailed(): void
    {
        $syncStatuses = [];
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset): AssetEntity {
                $asset->setId(83);
                return $asset;
            }
        );
        $assets->method('update')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$syncStatuses): AssetEntity {
                $syncStatuses[] = $asset->getSyncStatus();
                return $asset;
            }
        );

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->willReturn(['provider_group_id' => 'group-default']);
        $provider->expects(self::once())
            ->method('createAsset')
            ->willReturn(['provider_asset_id' => 'asset-failed', 'provider_status' => 'FAILED']);
        $provider->expects(self::never())->method('getAssetStatus');
        // 合规不通过时不在这里回收：远程凭证已经落库，何时清理交给人工或补偿任务决定。
        $provider->expects(self::never())->method('deleteAsset');
        $provider->expects(self::never())->method('deleteAssetGroup');

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('saveMapping')->willReturn($this->createMock(AssetProviderAssetModel::class));

        try {
            $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
                $this->dataIsolation('org-a', 'user-a', ['org-a']),
                new AssetEntity(['file_key' => 'a.png']),
            );
            self::fail('合规未通过必须抛出 COMPLIANCE_FAILED');
        } catch (BusinessException $exception) {
            self::assertSame(AssetErrorCode::COMPLIANCE_FAILED->value, $exception->getCode());
        }

        self::assertSame([AssetSyncStatus::SYNCING, AssetSyncStatus::FAILED], $syncStatuses);
    }

    public function testGroupAssetSkipsProviderEntirely(): void
    {
        $saveStatuses = [];
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use (&$saveStatuses): AssetEntity {
                $saveStatuses[] = $asset->getSyncStatus();
                $asset->setId(21);
                return $asset;
            }
        );
        // 素材组落库即终态，不该再有同步状态回写。
        $assets->expects(self::never())->method('update');

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->expects(self::never())->method('createAssetGroup');
        $provider->expects(self::never())->method('createAsset');
        $provider->expects(self::never())->method('getAssetStatus');
        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->expects(self::never())->method('saveMapping');

        $result = $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['asset_kind' => 'GROUP', 'name_i18n' => ['default' => '小灯']]),
        );

        self::assertSame([AssetSyncStatus::SYNCED], $saveStatuses);
        self::assertSame(21, $result->getId());
    }

    public function testAssetCreatesOwnProviderGroupInsteadOfReusingParentGroup(): void
    {
        $assets = $this->savingAssets(31);
        // 父组只用于本地存在性校验：第三方素材组不再复用父组映射。
        $assets->expects(self::once())->method('findById')->willReturn(new AssetEntity([
            'id' => 11,
            'asset_kind' => 'GROUP',
            'name_i18n' => ['default' => '父组'],
        ]));

        $persisted = [];
        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->expects(self::never())->method('findMapping');
        $providerAssets->expects(self::exactly(2))->method('saveMapping')->willReturnCallback(
            function (AssetDataIsolation $isolation, ProviderAssetEntity $mapping) use (&$persisted): AssetProviderAssetModel {
                $persisted[] = [$mapping->getAssetId(), $mapping->getProviderGroupId()];
                return $this->createMock(AssetProviderAssetModel::class);
            }
        );

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        // 专属素材组的组名跟随素材名，而不是父组名。
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->with(self::callback(static fn (array $payload): bool => $payload['name'] === '头像.png'))
            ->willReturn(['provider_group_id' => 'group-31']);
        $provider->expects(self::once())
            ->method('createAsset')
            ->with(self::callback(static fn (array $payload): bool => $payload['group_id'] === 'group-31'))
            ->willReturn(['provider_asset_id' => 'asset-31', 'provider_status' => 'ACTIVE']);
        $provider->expects(self::never())->method('getAssetStatus');

        $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png', 'parent_id' => 11, 'name_i18n' => ['default' => '头像.png']]),
        );

        // 组凭证先写、素材凭证后写，但两行都落在素材自己的 asset_id 上。
        self::assertSame([[31, 'group-31'], [31, 'group-31']], $persisted);
    }

    public function testProviderMetadataKeepsRawResponseInsteadOfMappedWrapper(): void
    {
        $rawResponse = [
            'ResponseMetadata' => ['RequestId' => 'req-1', 'Action' => 'CreateAsset'],
            'Result' => ['Id' => 'asset-51'],
        ];
        $metadata = [];
        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->expects(self::exactly(2))->method('saveMapping')->willReturnCallback(
            function (AssetDataIsolation $isolation, ProviderAssetEntity $mapping) use (&$metadata): AssetProviderAssetModel {
                $metadata[] = $mapping->getMetadata();
                return $this->createMock(AssetProviderAssetModel::class);
            }
        );
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->willReturn(['provider_group_id' => 'group-51']);
        $provider->expects(self::once())->method('createAsset')->willReturn([
            'provider_asset_id' => 'asset-51',
            'provider_status' => 'ACTIVE',
            'metadata' => $rawResponse,
        ]);

        $this->serviceWithFakedPolling($this->savingAssets(51), $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png']),
        );

        // 组凭证那行还没有素材，metadata 为空；素材凭证那行只留第三方原始响应，
        // 不把 provider_asset_id / provider_status 在 metadata 列里再抄一遍。
        self::assertSame([null, $rawResponse], $metadata);
    }

    public function testAssetWithoutParentAlsoCreatesItsOwnProviderGroup(): void
    {
        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        // 不再有组织默认素材组：没有父组的素材同样自带一个专属组。
        $providerAssets->expects(self::never())->method('findMapping');
        $providerAssets->expects(self::exactly(2))->method('saveMapping')->willReturnCallback(
            function (AssetDataIsolation $isolation, ProviderAssetEntity $mapping): AssetProviderAssetModel {
                self::assertSame(41, $mapping->getAssetId());
                self::assertSame('group-41', $mapping->getProviderGroupId());
                return $this->createMock(AssetProviderAssetModel::class);
            }
        );
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->with(self::callback(static fn (array $payload): bool => $payload['name'] === '风格.png' && $payload['project_name'] === 'default'))
            ->willReturn(['provider_group_id' => 'group-41']);
        $provider->expects(self::once())
            ->method('createAsset')
            ->with(self::callback(static fn (array $payload): bool => $payload['group_id'] === 'group-41'))
            ->willReturn(['provider_asset_id' => 'asset-41', 'provider_status' => 'ACTIVE']);

        $this->serviceWithFakedPolling($this->savingAssets(41), $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png', 'name_i18n' => ['default' => '风格.png']]),
        );
    }

    public function testUnnamedAssetStillGetsANamedProviderGroup(): void
    {
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        // 素材没有名字也不能给火山传一个空组名。
        $provider->expects(self::once())
            ->method('createAssetGroup')
            ->with(self::callback(static fn (array $payload): bool => $payload['name'] === '未命名素材组'))
            ->willReturn(['provider_group_id' => 'group-51']);
        $provider->expects(self::once())
            ->method('createAsset')
            ->willReturn(['provider_asset_id' => 'asset-51', 'provider_status' => 'ACTIVE']);
        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('saveMapping')->willReturn($this->createMock(AssetProviderAssetModel::class));

        $this->serviceWithFakedPolling($this->savingAssets(51), $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png']),
        );
    }

    public function testUnknownParentGroupIsRejectedBeforePersisting(): void
    {
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('findById')->willReturn(null);
        // 本地校验失败直接拒绝：既不留孤儿记录，也不会发出任何第三方调用。
        $assets->expects(self::never())->method('save');
        $assets->expects(self::never())->method('update');

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->expects(self::never())->method('saveMapping');
        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->expects(self::never())->method('createAssetGroup');
        $provider->expects(self::never())->method('createAsset');

        try {
            $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
                $this->dataIsolation('org-a', 'user-a', ['org-a']),
                new AssetEntity(['file_key' => 'a.png', 'parent_id' => 99]),
            );
            self::fail('父组不存在时必须抛出 NOT_FOUND');
        } catch (BusinessException $exception) {
            self::assertSame(AssetErrorCode::NOT_FOUND->value, $exception->getCode());
        }
    }

    public function testParentPointingAtAssetIsRejected(): void
    {
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->expects(self::once())->method('findById')->willReturn(new AssetEntity([
            'id' => 12,
            'asset_kind' => 'ASSET',
        ]));
        $assets->expects(self::never())->method('save');

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->expects(self::never())->method('createAsset');

        try {
            $this->serviceWithFakedPolling(
                $assets,
                $provider,
                $this->createMock(AssetProviderAssetRepositoryInterface::class),
            )->createPersonal(
                $this->dataIsolation('org-a', 'user-a', ['org-a']),
                new AssetEntity(['file_key' => 'a.png', 'parent_id' => 12]),
            );
            self::fail('父级必须是素材组，挂到素材上时必须抛出 NOT_FOUND');
        } catch (BusinessException $exception) {
            self::assertSame(AssetErrorCode::NOT_FOUND->value, $exception->getCode());
        }
    }

    public function testSyncStatusToleratesLegacyNumbersAndAnyCase(): void
    {
        self::assertSame(AssetSyncStatus::SYNCED, AssetSyncStatus::fromValue('synced'));
        self::assertSame(AssetSyncStatus::FAILED, AssetSyncStatus::fromValue('Failed'));
        // 改造前这一列是 tinyint，历史行读出来是 '0'..'3'。
        self::assertSame(AssetSyncStatus::PENDING, AssetSyncStatus::fromValue(0));
        self::assertSame(AssetSyncStatus::SYNCED, AssetSyncStatus::fromValue('2'));
        // 无法识别的取值一律按待同步处理：不对外展示，也不会把列表查询打断。
        self::assertSame(AssetSyncStatus::PENDING, AssetSyncStatus::fromValue(''));
        self::assertSame(AssetSyncStatus::PENDING, AssetSyncStatus::fromValue('whatever'));

        self::assertSame(AssetSyncStatus::FAILED, (new AssetEntity(['sync_status' => '3']))->getSyncStatus());
    }

    public function testDuplicateContentReusesProviderAssetInsteadOfReuploading(): void
    {
        $assets = $this->savingAssets(71);
        // 同一内容（content_hash 相同）已存在可复用凭证：不再建组、不再建素材、不轮询合规。
        $assets->method('findIdsByContentHash')->willReturn([50]);

        $reusable = new ProviderAssetEntity([
            'asset_id' => 50,
            'provider_code' => 'ark',
            'project_name' => 'default',
            'provider_group_id' => 'group-50',
            'provider_asset_id' => 'asset-50',
            'provider_status' => 'ACTIVE',
        ]);

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('findReusableMappingByAssetIds')
            ->with([50], 'ark', 'default')
            ->willReturn($reusable);
        // 复用只写一行映射（绑定到已审核通过的第三方素材），不触发任何第三方创建。
        $providerAssets->expects(self::once())->method('saveMapping')->willReturn($this->createMock(AssetProviderAssetModel::class));

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::never())->method('createAssetGroup');
        $provider->expects(self::never())->method('createAsset');
        $provider->expects(self::never())->method('getAssetStatus');

        $this->serviceWithFakedPolling($assets, $provider, $providerAssets)->createPersonal(
            $this->dataIsolation('org-a', 'user-a', ['org-a']),
            new AssetEntity(['file_key' => 'a.png', 'content_hash' => 'sha256:abc']),
        );
    }

    public function testDeletingOthersSharedAssetIsRejected(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity([
            'id' => 4,
            'organization_code' => 'org-a',
            'user_id' => 'user-b',
        ]));
        $repository->expects(self::never())->method('delete');

        $service = new AssetDomainService(
            $repository,
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );

        // 团队分享的素材归创建者，删除接口只放行本人创建的资产。
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(AssetErrorCode::DELETE_DENIED->value);
        $service->deletePersonal($this->dataIsolation('org-a', 'user-a', ['org-a']), 4);
    }

    public function testDeletingMissingAssetIsRejected(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(null);
        $repository->expects(self::never())->method('delete');

        $service = new AssetDomainService(
            $repository,
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );

        // 不可见的资产按不存在返回，避免通过删除接口探测别人资产是否存在。
        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(AssetErrorCode::NOT_FOUND->value);
        $service->deletePersonal($this->dataIsolation('org-a', 'user-a', ['org-a']), 4);
    }

    public function testDeletingNonEmptyGroupIsRejected(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity([
            'id' => 5,
            'organization_code' => 'org-a',
            'user_id' => 'user-a',
            'asset_kind' => 'GROUP',
        ]));
        $repository->method('hasChildren')->willReturn(true);
        $repository->expects(self::never())->method('delete');

        $service = new AssetDomainService(
            $repository,
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );

        $this->expectException(BusinessException::class);
        $this->expectExceptionCode(AssetErrorCode::GROUP_NOT_EMPTY->value);
        $service->deletePersonal($this->dataIsolation('org-a', 'user-a', ['org-a']), 5);
    }

    public function testDeletingEmptyGroupDeletesLocallyOnly(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity([
            'id' => 9,
            'organization_code' => 'org-a',
            'user_id' => 'user-a',
            'asset_kind' => 'GROUP',
        ]));
        $repository->method('hasChildren')->willReturn(false);
        $repository->expects(self::once())->method('delete')->willReturn(true);

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->expects(self::never())->method('findMapping');

        $service = new AssetDomainService(
            $repository,
            $providerAssets,
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );

        self::assertTrue($service->deletePersonal($this->dataIsolation('org-a', 'user-a', ['org-a']), 9));
    }

    public function testDeletingAssetWithoutProviderMappingJustDeletesLocally(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity([
            'id' => 6,
            'organization_code' => 'org-a',
            'user_id' => 'user-a',
            'asset_kind' => 'ASSET',
        ]));
        $repository->expects(self::once())->method('delete')->willReturn(true);

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('findMapping')->willReturn(null);
        $providerAssets->expects(self::never())->method('deleteMapping');

        $service = new AssetDomainService(
            $repository,
            $providerAssets,
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );

        self::assertTrue($service->deletePersonal($this->dataIsolation('org-a', 'user-a', ['org-a']), 6));
    }

    public function testDeletingLastReferenceReclaimsProviderAsset(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity([
            'id' => 7,
            'organization_code' => 'org-a',
            'user_id' => 'user-a',
            'asset_kind' => 'ASSET',
        ]));
        $repository->expects(self::once())->method('delete')->willReturn(true);

        $mappingModel = $this->createMock(AssetProviderAssetModel::class);
        $mappingModel->method('toArray')->willReturn([
            'asset_id' => 7,
            'provider_code' => 'ark',
            'project_name' => 'default',
            'provider_asset_id' => 'asset-7',
            'provider_group_id' => 'group-7',
            'provider_status' => 'ACTIVE',
            'metadata' => null,
        ]);

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('findMapping')->willReturn($mappingModel);
        $providerAssets->expects(self::once())->method('countOtherReferences')->willReturn(0);
        $providerAssets->expects(self::once())->method('deleteMapping')->willReturn(true);

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::once())->method('deleteAsset')->with('asset-7', 'default')->willReturn(true);
        $provider->expects(self::once())->method('deleteAssetGroup')->with('group-7', 'default')->willReturn(true);

        $service = new AssetDomainService($repository, $providerAssets, $this->acceptedAgreement(), $provider);

        self::assertTrue($service->deletePersonal($this->dataIsolation('org-a', 'user-a', ['org-a']), 7));
    }

    public function testDeletingAssetWithOtherReferencesKeepsProviderAsset(): void
    {
        $repository = $this->createMock(AssetRepositoryInterface::class);
        $repository->method('findById')->willReturn(new AssetEntity([
            'id' => 8,
            'organization_code' => 'org-a',
            'user_id' => 'user-a',
            'asset_kind' => 'ASSET',
        ]));
        $repository->expects(self::once())->method('delete')->willReturn(true);

        $mappingModel = $this->createMock(AssetProviderAssetModel::class);
        $mappingModel->method('toArray')->willReturn([
            'asset_id' => 8,
            'provider_code' => 'ark',
            'project_name' => 'default',
            'provider_asset_id' => 'asset-8',
            'provider_group_id' => 'group-8',
            'provider_status' => 'ACTIVE',
            'metadata' => null,
        ]);

        $providerAssets = $this->createMock(AssetProviderAssetRepositoryInterface::class);
        $providerAssets->method('findMapping')->willReturn($mappingModel);
        $providerAssets->expects(self::once())->method('countOtherReferences')->willReturn(1);
        $providerAssets->expects(self::never())->method('deleteMapping');

        $provider = $this->createMock(AssetProviderInterface::class);
        $provider->method('getProviderCode')->willReturn('ark');
        $provider->expects(self::never())->method('deleteAsset');
        $provider->expects(self::never())->method('deleteAssetGroup');

        $service = new AssetDomainService($repository, $providerAssets, $this->acceptedAgreement(), $provider);

        self::assertTrue($service->deletePersonal($this->dataIsolation('org-a', 'user-a', ['org-a']), 8));
    }

    /**
     * 用匿名子类把合规轮询的等待与上限都收短，专注验证同步编排与状态流转。
     *
     * @param int $pollsBeforeTimeout 允许的回查次数，超过即判超时；传 1 表示回查一次后超时
     */
    private function serviceWithFakedPolling(
        AssetRepositoryInterface $assets,
        AssetProviderInterface $provider,
        AssetProviderAssetRepositoryInterface $providerAssets,
        ?LoggerInterface $logger = null,
        int $pollsBeforeTimeout = PHP_INT_MAX,
    ): AssetDomainService {
        return new class($assets, $providerAssets, $this->acceptedAgreement(), $provider, $logger, $pollsBeforeTimeout) extends AssetDomainService {
            private int $pollCount = 0;

            public function __construct(
                AssetRepositoryInterface $assets,
                AssetProviderAssetRepositoryInterface $providerAssets,
                AssetAgreementRepositoryInterface $agreements,
                ?AssetProviderInterface $provider,
                ?LoggerInterface $logger,
                private readonly int $testPollsBeforeTimeout,
            ) {
                parent::__construct($assets, $providerAssets, $agreements, $provider, $logger);
            }

            protected function isComplianceWaitExpired(float $deadline): bool
            {
                return ++$this->pollCount > $this->testPollsBeforeTimeout;
            }

            protected function waitBeforeNextCompliancePoll(): void
            {
            }
        };
    }

    private function collectingLogger(): AbstractLogger
    {
        return new class extends AbstractLogger {
            /** @var array<int, array{message: string, context: array<string, mixed>}> */
            public array $records = [];

            public function log($level, $message, array $context = []): void
            {
                $this->records[] = ['message' => (string) $message, 'context' => $context];
            }
        };
    }

    /**
     * @return null|array{message: string, context: array<string, mixed>}
     */
    private function findLogRecord(AbstractLogger $logger, string $message): ?array
    {
        foreach ($logger->records as $record) {
            if ($record['message'] === $message) {
                return $record;
            }
        }
        return null;
    }

    /**
     * 返回一个 save 时补齐雪花 ID、update 时原样回传的资产仓储。
     */
    private function savingAssets(int $id): AssetRepositoryInterface
    {
        $assets = $this->createMock(AssetRepositoryInterface::class);
        $assets->method('save')->willReturnCallback(
            static function (AssetDataIsolation $isolation, AssetEntity $asset) use ($id): AssetEntity {
                $asset->setId($id);
                return $asset;
            }
        );
        $assets->method('update')->willReturnCallback(
            static fn (AssetDataIsolation $isolation, AssetEntity $asset): AssetEntity => $asset,
        );
        return $assets;
    }

    private function assetModel(array $attributes): AssetModel
    {
        $attributes = array_merge([
            'id' => 1,
            'organization_code' => 'org-a',
            'user_id' => 'user-a',
            'asset_kind' => 'ASSET',
            'asset_business_type' => 'GENERAL',
            'asset_media_type' => 'IMAGE',
            'name_i18n' => ['default' => 'asset.png'],
            'description_i18n' => null,
            'file_key' => 'asset.png',
            'status' => 1,
            // 列表与详情只返回已完成第三方同步的资产，夹具默认按已同步构造。
            'sync_status' => AssetSyncStatus::SYNCED->value,
        ], $attributes);
        $model = $this->createMock(AssetModel::class);
        $model->method('toArray')->willReturn($attributes);
        $model->method('getKey')->willReturn($attributes['id']);
        return $model;
    }

    private function domainService(AssetRepositoryInterface $repository): AssetDomainService
    {
        return new AssetDomainService(
            $repository,
            $this->createMock(AssetProviderAssetRepositoryInterface::class),
            $this->acceptedAgreement(),
            $this->createMock(AssetProviderInterface::class),
        );
    }

    private function acceptedAgreement(): AssetAgreementRepositoryInterface
    {
        $agreement = $this->createMock(AssetAgreementRepositoryInterface::class);
        $agreement->method('hasAccepted')->willReturn(true);
        return $agreement;
    }

    private function dataIsolation(string $organization, string $user, array $official): AssetDataIsolation
    {
        $isolation = $this->createMock(AssetDataIsolation::class);
        $isolation->method('getCurrentOrganizationCode')->willReturn($organization);
        $isolation->method('getCurrentUserId')->willReturn($user);
        $isolation->method('getOrganizationCodes')->willReturn($official);
        $isolation->method('getOfficialOrganizationCodes')->willReturn(['official']);
        return $isolation;
    }

    /**
     * ResourceVisibilityDomainService 是 readonly class，无法 createMock，用真实实例 + mock 仓储。
     */
    private function visibilityDomainService(): ResourceVisibilityDomainService
    {
        return new ResourceVisibilityDomainService(
            $this->createMock(ResourceVisibilityRepositoryInterface::class),
            $this->createMock(MagicDepartmentUserRepositoryInterface::class),
        );
    }
}
