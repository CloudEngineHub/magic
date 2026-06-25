<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\Provider\Service;

use App\Domain\Provider\Entity\AiAbilityEntity;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Entity\ValueObject\ProviderDataIsolation;
use App\Domain\Provider\Repository\Facade\AiAbilityRepositoryInterface;
use App\Domain\Provider\Service\AiAbilityDomainService;
use App\Infrastructure\Util\Locker\LockerInterface;
use Hyperf\Contract\ConfigInterface;
use PHPUnit\Framework\TestCase;
use Throwable;

/**
 * @internal
 */
class AiAbilityDomainServiceTest extends TestCase
{
    public function testInitializeAbilitiesUsesProvidedConfig(): void
    {
        $repository = $this->createMock(AiAbilityRepositoryInterface::class);
        $repository->expects($this->once())
            ->method('getExistingCodes')
            ->with(
                $this->isInstanceOf(ProviderDataIsolation::class),
                [AiAbilityCode::KnowledgeBaseEmbeddingModel]
            )
            ->willReturn([]);
        $repository->expects($this->never())
            ->method('getByCode');
        $repository->expects($this->once())
            ->method('save')
            ->with($this->callback(static function (AiAbilityEntity $entity): bool {
                return $entity->getCode() === AiAbilityCode::KnowledgeBaseEmbeddingModel
                    && $entity->getOrganizationCode() === 'ORG-1'
                    && $entity->getConfig()['model_id'] === 'BAAI/bge-base-zh-v1.5';
            }))
            ->willReturn(true);

        $config = $this->createMock(ConfigInterface::class);
        $config->expects($this->never())->method('get');

        $service = new AiAbilityDomainService($repository, $config, $this->createLocker());

        $count = $service->initializeAbilities(ProviderDataIsolation::create('ORG-1'), [
            [
                'code' => 'knowledge_base_embedding_model',
                'name' => '知识库嵌入模型',
                'description' => 'desc',
                'config' => [
                    'model_id' => 'BAAI/bge-base-zh-v1.5',
                ],
            ],
        ]);

        $this->assertSame(1, $count);
    }

    public function testInitializeAbilitiesSkipsExistingCodesFromBatchQuery(): void
    {
        $repository = $this->createMock(AiAbilityRepositoryInterface::class);
        $repository->expects($this->once())
            ->method('getExistingCodes')
            ->with(
                $this->isInstanceOf(ProviderDataIsolation::class),
                [AiAbilityCode::KnowledgeBaseEmbeddingModel]
            )
            ->willReturn([AiAbilityCode::KnowledgeBaseEmbeddingModel->value]);
        $repository->expects($this->never())
            ->method('getByCode');
        $repository->expects($this->never())
            ->method('save');

        $config = $this->createMock(ConfigInterface::class);
        $config->expects($this->never())->method('get');

        $service = new AiAbilityDomainService($repository, $config, $this->createLocker());

        $count = $service->initializeAbilities(ProviderDataIsolation::create('ORG-1'), [
            [
                'code' => 'knowledge_base_embedding_model',
                'name' => '知识库嵌入模型',
                'description' => 'desc',
                'config' => [
                    'model_id' => 'BAAI/bge-base-zh-v1.5',
                ],
            ],
        ]);

        $this->assertSame(0, $count);
    }

    public function testInitializeAbilitiesStopsWhenLockIsNotAcquired(): void
    {
        $repository = $this->createMock(AiAbilityRepositoryInterface::class);
        $repository->expects($this->never())->method('getExistingCodes');
        $repository->expects($this->never())->method('save');

        $config = $this->createMock(ConfigInterface::class);
        $config->expects($this->never())->method('get');

        $locker = $this->createMock(LockerInterface::class);
        $locker->expects($this->once())
            ->method('spinLock')
            ->willReturn(false);
        $locker->expects($this->never())
            ->method('release');

        $service = new AiAbilityDomainService($repository, $config, $locker);

        $this->expectException(Throwable::class);
        $service->initializeAbilities(ProviderDataIsolation::create('ORG-1'), [
            [
                'code' => 'knowledge_base_embedding_model',
                'name' => '知识库嵌入模型',
                'description' => 'desc',
                'config' => [
                    'model_id' => 'BAAI/bge-base-zh-v1.5',
                ],
            ],
        ]);
    }

    /**
     * 创建默认可获取锁的测试锁对象.
     */
    private function createLocker(): LockerInterface
    {
        $locker = $this->createMock(LockerInterface::class);
        $locker->expects($this->once())
            ->method('spinLock')
            ->willReturn(true);
        $locker->expects($this->once())
            ->method('release')
            ->willReturn(true);

        return $locker;
    }
}
