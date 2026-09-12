<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\Kernel\Service;

use App\Domain\Kernel\Service\AbstractVectorIndexDomainService;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGeneratorInterface;
use App\Infrastructure\Core\Embeddings\VectorStores\CollectionInfo;
use App\Infrastructure\Core\Embeddings\VectorStores\VectorStoreInterface;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Odin\Contract\Model\EmbeddingInterface;
use Hyperf\Redis\Redis;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * @internal
 */
final class AbstractVectorIndexDomainServiceTest extends TestCase
{
    /** Vector size reported by the fallback model when the fixed dimension policy is off. */
    private const FALLBACK_MODEL_SIZE = 1024;

    public function testMatchingCollectionSizePassesWithoutLogging(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('error');

        $service = $this->service(logger: $logger);

        $service->assertSize('agent_markets', $service->expected());
    }

    public function testMismatchedCollectionSizeLogsAndThrows(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(
            self::stringContains('Agent market vector sync stopped because embedding dimensions do not match'),
            self::callback(static fn (array $context): bool => $context['collection_name'] === 'agent_markets'
                && $context['resource_id'] === 'res-1'),
        );

        $service = $this->service(logger: $logger);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Agent market embedding dimension does not match the vector collection');

        $service->assertSize('agent_markets', $service->expected() + 1, 'res-1');
    }

    public function testEnsureCollectionResolvesSizeFromEmbedding(): void
    {
        $size = $this->expectedModelOutputSize();

        $store = $this->createMock(VectorStoreInterface::class);
        $store->method('getCollection')->willReturn(null);
        $store->expects(self::once())->method('createCollection')->with('agent_markets', $size);

        $this->service(store: $store)->ensure('agent_markets', array_fill(0, $size, 0.0));
    }

    public function testForcedRebuildInvalidatesAvailabilityCache(): void
    {
        $size = $this->expectedModelOutputSize();

        $store = $this->createMock(VectorStoreInterface::class);
        $store->method('getCollection')->willReturn(new CollectionInfo('agent_markets', 0, 0, 1));
        $store->expects(self::once())->method('removeCollection')->with('agent_markets');
        $store->expects(self::once())->method('createCollection')->with('agent_markets', $size);

        $service = $this->service(store: $store);
        $service->ensure('agent_markets', array_fill(0, $size, 0.0), true);

        self::assertFalse($service->availability());
    }

    private function expectedModelOutputSize(): int
    {
        return (int) config('vector_index.embedding_dimension.size', 2048);
    }

    private function service(
        ?VectorStoreInterface $store = null,
        ?EmbeddingGeneratorInterface $generator = null,
        ?LoggerInterface $logger = null,
    ): AbstractVectorIndexDomainService {
        $model = $this->createMock(EmbeddingInterface::class);
        $model->method('getVectorSize')->willReturn(self::FALLBACK_MODEL_SIZE);

        $generator ??= $this->createMock(EmbeddingGeneratorInterface::class);
        $generator->method('getDefaultModel')->willReturn($model);

        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($logger ?? $this->createMock(LoggerInterface::class));

        return new class($store ?? $this->createMock(VectorStoreInterface::class), $generator, $this->createMock(Redis::class), $loggerFactory, $this->createMock(BaseDataIsolation::class)) extends AbstractVectorIndexDomainService {
            public function __construct(
                VectorStoreInterface $vectorStore,
                EmbeddingGeneratorInterface $embeddingGenerator,
                Redis $redis,
                LoggerFactory $loggerFactory,
                private readonly BaseDataIsolation $isolation,
            ) {
                parent::__construct($vectorStore, $embeddingGenerator, $redis, $loggerFactory);
            }

            public function expected(): int
            {
                return $this->expectedCollectionSize($this->isolation);
            }

            public function assertSize(string $collectionName, int $collectionVectorSize, string $resourceId = ''): void
            {
                $this->assertExistingCollectionSize($collectionName, $collectionVectorSize, $this->isolation, $resourceId);
            }

            /** @param array<int, float> $embedding */
            public function ensure(string $collectionName, array $embedding, bool $forceReEmbedding = false): void
            {
                $this->ensureCollection($collectionName, $embedding, $forceReEmbedding);
            }

            public function availability(): ?bool
            {
                return $this->availabilityCache;
            }

            protected function collectionName(): string
            {
                return 'agent_markets';
            }

            protected function businessLabel(): string
            {
                return 'Agent market';
            }

            protected function initializedKey(): string
            {
                return 'vector_index:initialized:agent_market';
            }
        };
    }
}
