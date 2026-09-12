<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Kernel\Service;

use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGenerator;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGeneratorInterface;
use App\Infrastructure\Core\Embeddings\VectorStores\VectorStoreInterface;
use GuzzleHttp\Exception\ClientException;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Redis\Redis;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Throwable;

use function Hyperf\Config\config;

/**
 * Shared kernel for the market vector index domain services.
 *
 * Agent market, Skill market and Slides template each index one Qdrant collection and share the
 * same availability caching, readiness flag, point removal and dimension handling. Only the
 * domain specific parts (collection name, business label, payload, filters, embedding text) stay
 * in the concrete services.
 */
abstract class AbstractVectorIndexDomainService
{
    /** Cached collection availability; invalidated whenever a collection is rebuilt. */
    protected ?bool $availabilityCache = null;

    protected int $availabilityCacheExpiresAt = 0;

    protected LoggerInterface $logger;

    public function __construct(
        protected readonly VectorStoreInterface $vectorStore,
        protected readonly EmbeddingGeneratorInterface $embeddingGenerator,
        protected readonly Redis $redis,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('vector-index-sync');
    }

    public function isAvailable(): bool
    {
        $now = time();
        if ($this->availabilityCache !== null && $this->availabilityCacheExpiresAt > $now) {
            return $this->availabilityCache;
        }

        try {
            $available = $this->vectorStore->getCollection($this->collectionName()) !== null;
        } catch (Throwable) {
            $available = false;
        }

        $this->availabilityCache = $available;
        $this->availabilityCacheExpiresAt = $now + max(
            0,
            (int) config('vector_index.availability_cache_seconds', 60),
        );

        return $available;
    }

    public function isVectorSearchEnabled(): bool
    {
        return (bool) config('vector_index.enabled', true)
            && EmbeddingGenerator::isEnabled(AiAbilityCode::KnowledgeBaseEmbeddingModel);
    }

    /** Return whether the first full reconciliation has completed. */
    public function isVectorSearchReady(): bool
    {
        if (! $this->isVectorSearchEnabled()) {
            return false;
        }

        return (bool) $this->redis->exists($this->initializedKey());
    }

    /** Record a successful full reconciliation for subsequent semantic searches. */
    public function markVectorIndexInitialized(): void
    {
        $this->redis->set($this->initializedKey(), (string) time());
    }

    /** Qdrant collection backing this index. */
    abstract protected function collectionName(): string;

    /** Business label used in dimension-mismatch exceptions and logs. */
    abstract protected function businessLabel(): string;

    /** Redis key marking that the first complete reconciliation succeeded. */
    abstract protected function initializedKey(): string;

    /**
     * Resolve the dimension the collection must have under the current policy.
     *
     * This only answers which size an existing collection is expected to use; model output is
     * validated separately when a vector is written.
     */
    protected function expectedCollectionSize(BaseDataIsolation $dataIsolation): int
    {
        return $this->isVectorSearchEnabled()
            ? $this->configuredEmbeddingSize()
            : $this->embeddingGenerator->getDefaultModel($dataIsolation)->getVectorSize();
    }

    /** Fail fast when an existing collection was built with a different embedding dimension. */
    protected function assertExistingCollectionSize(
        string $collectionName,
        int $collectionVectorSize,
        BaseDataIsolation $dataIsolation,
        string $resourceId = '',
    ): void {
        $expectedSize = $this->expectedCollectionSize($dataIsolation);
        if ($collectionVectorSize === $expectedSize) {
            return;
        }

        $this->logger->error(
            sprintf('%s vector sync stopped because embedding dimensions do not match', $this->businessLabel()),
            [
                'resource_id' => $resourceId,
                'collection_name' => $collectionName,
                'collection_vector_size' => $collectionVectorSize,
                'embedding_vector_size' => $expectedSize,
                'fixed_dimension_enabled' => $this->isVectorSearchEnabled(),
            ],
        );

        $this->assertCollectionSize($this->businessLabel(), $collectionVectorSize, $expectedSize);
    }

    /** Ensure the collection matches the embedding dimension, rebuilding it only for forced migrations. */
    protected function ensureCollection(string $collectionName, array $embedding, bool $forceReEmbedding): void
    {
        $vectorSize = $this->resolveCollectionSize(count($embedding));
        $collection = $this->vectorStore->getCollection($collectionName);
        $rebuilt = false;

        if ($collection !== null && $collection->vectorSize !== $vectorSize) {
            if (! $forceReEmbedding) {
                $this->assertCollectionSize($this->businessLabel(), $collection->vectorSize, $vectorSize);
            }

            // A model change can change the vector dimension. Recreate the collection
            // once, then let the queued forced batches rebuild all points.
            $this->vectorStore->removeCollection($collectionName);
            $collection = null;
            $rebuilt = true;
        }

        if ($collection === null) {
            $this->logger->warning(__METHOD__ . ': Collection does not exist, creating new collection', [
                'collection' => $collectionName,
                'vector_size' => $vectorSize,
            ]);

            try {
                $this->vectorStore->createCollection($collectionName, $vectorSize);
            } catch (ClientException $exception) {
                // Another consumer may create the collection between the probe and create call.
                if (! $this->isCollectionAlreadyExists($exception)) {
                    throw $exception;
                }
            }
        }

        if ($rebuilt) {
            $this->availabilityCache = false;
        }
    }

    /** Remove the point when the configured collection exists. */
    protected function removePoint(string $resourceId): void
    {
        $collectionName = $this->collectionName();
        if ($this->vectorStore->getCollection($collectionName) !== null) {
            $this->vectorStore->removePoint($collectionName, $resourceId);
        }
    }

    /** Normalize search text so equivalent inputs share one embedding cache entry. */
    protected function normalizeKeyword(?string $keyword): string
    {
        $keyword = trim((string) $keyword);
        $keyword = preg_replace('/\s+/u', ' ', $keyword) ?? $keyword;

        return mb_strtolower($keyword, 'UTF-8');
    }

    /** Return the configured fixed embedding dimension. */
    private function configuredEmbeddingSize(): int
    {
        return (int) config('vector_index.embedding_dimension.size', 2048);
    }

    /** Resolve and validate the dimension of a generated embedding. */
    private function resolveCollectionSize(int $actualSize): int
    {
        if ($this->isVectorSearchEnabled()) {
            $fixedSize = $this->configuredEmbeddingSize();
            if ($actualSize !== $fixedSize) {
                throw new RuntimeException(sprintf(
                    '%s embedding dimension mismatch: model returned %d but %d is expected',
                    $this->businessLabel(),
                    $actualSize,
                    $fixedSize,
                ));
            }

            return $fixedSize;
        }

        return $actualSize;
    }

    /** Reject a collection whose dimension differs from the expected dimension. */
    private function assertCollectionSize(string $business, int $collectionSize, int $expectedSize): void
    {
        if ($collectionSize === $expectedSize) {
            return;
        }

        throw new RuntimeException(sprintf(
            '%s embedding dimension does not match the vector collection (collection=%d, expected=%d)',
            $business,
            $collectionSize,
            $expectedSize,
        ));
    }

    /** Check whether collection creation lost a race to another consumer. */
    private function isCollectionAlreadyExists(ClientException $exception): bool
    {
        $response = $exception->getResponse();

        return $response->getStatusCode() === 409
            && str_contains(strtolower((string) $response->getBody()), 'already exists');
    }
}
