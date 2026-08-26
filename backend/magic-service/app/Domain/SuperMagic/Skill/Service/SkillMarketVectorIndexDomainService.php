<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Skill\Service;

use App\Domain\ModelGateway\Entity\ValueObject\SourceId;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\SuperMagic\Skill\Entity\SkillCategoryEntity;
use App\Domain\SuperMagic\Skill\Entity\SkillMarketEntity;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\Query\SkillQuery;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\SkillCategoryRelationType;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\SkillDataIsolation;
use App\Domain\SuperMagic\Skill\Repository\Facade\SkillCategoryRelationRepositoryInterface;
use App\Domain\SuperMagic\Skill\Repository\Facade\SkillCategoryRepositoryInterface;
use App\Domain\SuperMagic\Skill\Repository\Facade\SkillMarketRepositoryInterface;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGenerator;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGeneratorInterface;
use App\Infrastructure\Core\Embeddings\VectorStores\VectorStoreInterface;
use App\Infrastructure\Core\ValueObject\Page;
use GuzzleHttp\Exception\ClientException;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Throwable;

final class SkillMarketVectorIndexDomainService
{
    private ?bool $availabilityCache = null;

    private int $availabilityCacheExpiresAt = 0;

    private LoggerInterface $logger;

    public function __construct(
        private readonly SkillMarketRepositoryInterface $skillMarketRepository,
        private readonly SkillCategoryRelationRepositoryInterface $skillCategoryRelationRepository,
        private readonly SkillCategoryRepositoryInterface $skillCategoryRepository,
        private readonly VectorStoreInterface $vectorStore,
        private readonly EmbeddingGeneratorInterface $embeddingGenerator,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory->get('vector-index-sync');
    }

    /** Check the SkillMarket collection with a short process-local cache. */
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

    /** Read the latest market state and apply the smallest required index update. */
    public function sync(string $resourceId, string $operatorId, bool $forceReEmbedding = false): void
    {
        $market = $this->skillMarketRepository->findByIdForVectorIndex((int) $resourceId);
        if ($market === null || ! $market->getPublishStatus()->isPublished() || $market->isHidden()) {
            $this->logger->info('Skill market vector point removed because the record is not visible', [
                'resource_type' => 'skill_market',
                'resource_id' => $resourceId,
                'reason' => $market === null ? 'market_not_found' : 'market_not_visible',
            ]);
            $this->removePoint($resourceId);
            return;
        }

        if (! $this->isVectorSearchEnabled()) {
            $this->logger->info('Skill market vector sync skipped because vector search is disabled', [
                'resource_type' => 'skill_market',
                'resource_id' => $resourceId,
                'operator_id' => $operatorId,
            ]);
            $this->removePoint($resourceId);
            return;
        }

        $categories = $this->findCategories($market);
        $semanticText = SkillMarketSearchTextBuilder::buildSemanticText($market, $categories);
        if ($semanticText === '') {
            throw new RuntimeException('Skill market semantic text is empty');
        }

        $payload = $this->buildPayload($market, $categories, $semanticText);
        $collectionName = $this->collectionName();
        $pointId = (string) $market->getId();
        $existingPoint = $this->vectorStore->getPoint($collectionName, $pointId);

        if ($existingPoint !== null) {
            if ($forceReEmbedding || ($existingPoint->payload['semantic_text'] ?? null) !== $semanticText) {
                $this->logger->info('Skill market vector re-embedding', [
                    'resource_id' => $resourceId,
                    'forced' => $forceReEmbedding,
                ]);
                $embedding = $this->generateEmbedding($market, $semanticText, $operatorId);
                $this->vectorStore->storePoint($collectionName, $pointId, $embedding, $payload);
                $this->availabilityCache = true;
                return;
            }

            $this->vectorStore->updatePayload($collectionName, $pointId, $payload);
            $this->availabilityCache = true;
            $this->logger->info('Skill market vector payload updated', ['resource_id' => $resourceId]);
            return;
        }

        $embedding = $this->generateEmbedding($market, $semanticText, $operatorId);
        if ($this->vectorStore->getCollection($collectionName) === null) {
            try {
                $this->vectorStore->createCollection($collectionName, count($embedding));
            } catch (ClientException $exception) {
                if (! $this->isCollectionAlreadyExists($exception)) {
                    throw $exception;
                }
            }
        }

        $this->vectorStore->storePoint($collectionName, $pointId, $embedding, $payload);
        $this->availabilityCache = true;
        $this->logger->info('Skill market vector stored', ['resource_id' => $resourceId]);
    }

    /** Rank candidates by vector similarity, then revalidate visibility in MySQL. */
    public function search(
        SkillDataIsolation $dataIsolation,
        SkillQuery $query,
        Page $page,
    ): array {
        $keyword = $this->normalizeKeyword($query->getKeyword());
        if ($keyword === '') {
            return [];
        }

        $embedding = $this->embeddingGenerator->embedText(
            $this->embeddingGenerator->getDefaultModel($dataIsolation),
            $keyword,
            [
                'business_params' => [
                    'organization_id' => $dataIsolation->getCurrentOrganizationCode(),
                    'user_id' => $dataIsolation->getCurrentUserId(),
                    'business_id' => 'skill-market-search:' . md5($keyword),
                    'source_id' => SourceId::SEMANTIC_SEARCH,
                ],
            ],
        );
        if ($embedding === []) {
            return [];
        }

        $points = $this->vectorStore->searchPoints(
            $this->collectionName(),
            $embedding,
            $page->getPageNum(),
            (float) config('vector_index.resources.skill_market.score_threshold', 0.4),
            $this->buildFilter($query),
            $page->getSliceStart(),
        );
        $ids = array_values(array_map(static fn ($point): string => (string) $point->id, $points));
        if ($ids === []) {
            return [];
        }

        $markets = $this->skillMarketRepository->findVisibleByIds($ids);
        return array_values(array_filter(array_map(
            static fn (string $id): ?SkillMarketEntity => $markets[(int) $id] ?? null,
            $ids,
        )));
    }

    /** Return whether the shared knowledge-base embedding ability is enabled. */
    public function isVectorSearchEnabled(): bool
    {
        return EmbeddingGenerator::isEnabled(AiAbilityCode::KnowledgeBaseEmbeddingModel);
    }

    /** Process a batch and return failed IDs for isolated retries. */
    public function reindexBatch(array $skillMarketIds, string $operatorId, bool $forceReEmbedding = false): array
    {
        $failedIds = [];
        foreach (array_values(array_unique(array_map('strval', $skillMarketIds))) as $skillMarketId) {
            try {
                $this->sync($skillMarketId, $operatorId, $forceReEmbedding);
            } catch (Throwable $throwable) {
                $failedIds[] = $skillMarketId;
                $this->logger->error('Skill market vector batch item failed', [
                    'resource_id' => $skillMarketId,
                    'exception' => $throwable::class,
                    'message' => $throwable->getMessage(),
                ]);
            }
        }

        return $failedIds;
    }

    /** @return array<int, SkillCategoryEntity> */
    private function findCategories(SkillMarketEntity $market): array
    {
        $marketId = $market->getId();
        if ($marketId === null) {
            return [];
        }

        $categoryIds = $this->skillCategoryRelationRepository->findCategoryIds(
            SkillCategoryRelationType::SkillMarket,
            $marketId,
        );
        if ($categoryIds === []) {
            return [];
        }

        $market->setCategoryIds($categoryIds);

        return $this->skillCategoryRepository->findByIds($categoryIds);
    }

    /** @param array<int, SkillCategoryEntity> $categories */
    private function buildPayload(SkillMarketEntity $market, array $categories, string $semanticText): array
    {
        return [
            'skill_market_id' => (string) $market->getId(),
            'skill_code' => $market->getSkillCode(),
            'organization_code' => $market->getOrganizationCode(),
            'skill_version_id' => $market->getSkillVersionId(),
            'semantic_text' => $semanticText,
            'publish_status' => $market->getPublishStatus()->value,
            'is_hidden' => $market->isHidden(),
            'publisher_type' => $market->getPublisherType()->value,
            'publisher_id' => $market->getPublisherId(),
            'category_ids' => $market->getCategoryIds(),
            'is_featured' => $market->isFeatured(),
            'sort_order' => $market->getSortOrder() ?? 0,
            'install_count' => $market->getTotalInstallCount(),
            'updated_at' => $market->getUpdatedAt() ?? '',
        ];
    }

    private function generateEmbedding(SkillMarketEntity $market, string $semanticText, string $operatorId): array
    {
        $embedding = $this->embeddingGenerator->embedText(
            $this->embeddingGenerator->getDefaultModel(
                SkillDataIsolation::create($market->getOrganizationCode(), $operatorId),
            ),
            $semanticText,
            [
                'business_params' => [
                    'organization_id' => $market->getOrganizationCode(),
                    'user_id' => $operatorId,
                    'business_id' => 'skill-market:' . $market->getId(),
                    'source_id' => SourceId::SKILL_MARKET_VECTOR_SYNC,
                ],
            ],
        );
        if ($embedding === []) {
            throw new RuntimeException('Skill market embedding is empty');
        }

        return $embedding;
    }

    private function removePoint(string $resourceId): void
    {
        $collectionName = $this->collectionName();
        if ($this->vectorStore->getCollection($collectionName) !== null) {
            $this->vectorStore->removePoint($collectionName, $resourceId);
        }
    }

    private function isCollectionAlreadyExists(ClientException $exception): bool
    {
        $response = $exception->getResponse();
        return $response->getStatusCode() === 409
            && str_contains(strtolower((string) $response->getBody()), 'already exists');
    }

    private function collectionName(): string
    {
        return (string) config('vector_index.resources.skill_market.collection', 'skill_markets');
    }

    private function normalizeKeyword(?string $keyword): string
    {
        $keyword = trim((string) $keyword);
        $keyword = preg_replace('/\s+/u', ' ', $keyword) ?? $keyword;
        return mb_strtolower($keyword, 'UTF-8');
    }

    private function buildFilter(SkillQuery $query): array
    {
        $must = [
            ['key' => 'publish_status', 'value' => 'PUBLISHED'],
            ['key' => 'is_hidden', 'value' => false],
        ];
        if ($query->getCodes() !== null && $query->getCodes() !== []) {
            $must[] = ['key' => 'skill_code', 'any' => $query->getCodes()];
        }
        if ($query->getCategoryIds() !== null && $query->getCategoryIds() !== []) {
            $categoryIds = $this->skillCategoryRepository->findSelfAndDescendantIds($query->getCategoryIds());
            $must[] = ['key' => 'category_ids', 'any' => $categoryIds];
        }
        if (($publisherType = $query->getPublisherType()) !== null && $publisherType !== '') {
            $must[] = ['key' => 'publisher_type', 'value' => $publisherType];
        }
        if ($query->getIsFeatured() !== null) {
            $must[] = ['key' => 'is_featured', 'value' => $query->getIsFeatured()];
        }

        return ['must' => $must];
    }
}
