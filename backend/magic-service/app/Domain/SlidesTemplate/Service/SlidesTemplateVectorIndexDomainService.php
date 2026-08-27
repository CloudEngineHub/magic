<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service;

use App\Domain\ModelGateway\Entity\ValueObject\SourceId;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateOwnerType;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateQueryScope;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagMatch;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateTagStatus;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateRepositoryInterface;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateTagRelationRepositoryInterface;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGenerator;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGeneratorInterface;
use App\Infrastructure\Core\Embeddings\VectorStores\VectorStoreInterface;
use App\Infrastructure\Core\ValueObject\Page;
use GuzzleHttp\Exception\ClientException;
use Hyperf\Logger\LoggerFactory;
use Hyperf\Redis\Redis;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Throwable;

final class SlidesTemplateVectorIndexDomainService
{
    private const VECTOR_INDEX_INITIALIZED_KEY = 'vector_index:initialized:slides_template';

    private ?bool $availabilityCache = null;

    private int $availabilityCacheExpiresAt = 0;

    private LoggerInterface $logger;

    public function __construct(
        private readonly SlidesTemplateRepositoryInterface $slidesTemplateRepository,
        private readonly SlidesTemplateTagRelationRepositoryInterface $slidesTemplateTagRelationRepository,
        private readonly VectorStoreInterface $vectorStore,
        private readonly EmbeddingGeneratorInterface $embeddingGenerator,
        private readonly Redis $redis,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory?->get('vector-index-sync');
    }

    /** Cache the collection probe briefly to avoid repeated checks during outages. */
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

    /** Remove Qdrant points that no longer represent enabled official templates. */
    public function removeOrphanPoints(SlidesTemplateDataIsolation $dataIsolation, string $organizationCode): int
    {
        $collectionName = $this->collectionName();
        if ($this->vectorStore->getCollection($collectionName) === null) {
            return 0;
        }

        $removed = 0;
        $offset = null;
        while (true) {
            $page = $this->vectorStore->scrollPoints($collectionName, 200, $offset);
            $pointIds = array_values(array_unique(array_map(
                static fn ($point): string => (string) $point->id,
                $page['points'],
            )));

            if ($pointIds !== []) {
                $existingIds = [];
                foreach ($this->slidesTemplateRepository->findVisibleByIds($dataIsolation, $pointIds) as $template) {
                    if ($template->getOwnerType()->isOfficial()
                        && $template->getOrganizationCode() === $organizationCode) {
                        $existingIds[(string) $template->getId()] = true;
                    }
                }

                $orphanIds = array_values(array_filter(
                    $pointIds,
                    static fn (string $pointId): bool => ! isset($existingIds[$pointId]),
                ));
                if ($orphanIds !== []) {
                    $this->vectorStore->removePoints($collectionName, $orphanIds);
                    $removed += count($orphanIds);
                    $this->logger->info('Slides template orphan vector points removed', [
                        'collection_name' => $collectionName,
                        'point_ids' => $orphanIds,
                        'batch_removed' => count($orphanIds),
                        'total_removed' => $removed,
                    ]);
                }
            }

            $nextOffset = $page['next_page_offset'];
            if ($nextOffset === null || $nextOffset === $offset || $pointIds === []) {
                break;
            }
            $offset = $nextOffset;
        }

        return $removed;
    }

    /** Read the latest template state and apply the smallest required index update. */
    public function sync(
        SlidesTemplateDataIsolation $dataIsolation,
        string $resourceId,
        string $operatorId,
        bool $forceReEmbedding = false,
    ): void {
        $template = $this->slidesTemplateRepository->findById($dataIsolation, $resourceId);
        if ($template === null || ! $template->getStatus()->isEnabled()) {
            $this->logger->info('Slides template vector sync skipped and stale point removed', [
                'resource_type' => 'slides_template',
                'resource_id' => $resourceId,
                'organization_code' => $template?->getOrganizationCode() ?: $dataIsolation->getCurrentOrganizationCode(),
                'operator_id' => $operatorId,
                'reason' => $template === null ? 'template_not_found' : 'template_disabled',
            ]);
            $this->removePoint($resourceId);
            return;
        }

        if (! $template->getOwnerType()->isOfficial()) {
            $this->logger->info('Slides template vector sync skipped because template owner is not official', [
                'resource_type' => 'slides_template',
                'resource_id' => $resourceId,
                'organization_code' => $template->getOrganizationCode(),
                'operator_id' => $operatorId,
                'owner_type' => $template->getOwnerType()->value,
            ]);
            $this->removePoint($resourceId);
            return;
        }

        if (! $this->isVectorSearchEnabled()) {
            $this->logger->info('Slides template vector sync skipped because vector search is disabled', [
                'resource_type' => 'slides_template',
                'resource_id' => $resourceId,
                'organization_code' => $template->getOrganizationCode(),
                'operator_id' => $operatorId,
            ]);
            $this->removePoint($resourceId);
            return;
        }

        $collectionName = $this->collectionName();
        $collection = $this->vectorStore->getCollection($collectionName);
        $embeddingModel = $this->embeddingGenerator->getDefaultModel($dataIsolation);
        if ($collection !== null && $collection->vectorSize !== $embeddingModel->getVectorSize()) {
            $this->logger->error('Slides template vector sync stopped because embedding dimensions do not match', [
                'resource_id' => $resourceId,
                'collection_name' => $collectionName,
                'collection_vector_size' => $collection->vectorSize,
                'embedding_vector_size' => $embeddingModel->getVectorSize(),
            ]);
            throw new RuntimeException('Slides template embedding dimension does not match the vector collection');
        }

        $tagMap = $this->slidesTemplateTagRelationRepository->findTagsByTemplateIds(
            $dataIsolation,
            [(int) $template->getId()],
            SlidesTemplateTagStatus::Enabled->value,
        );
        $template->setTags($tagMap[(int) $template->getId()] ?? []);
        $payload = $this->buildPayload($template, $template->getTags());
        $searchText = SlidesTemplateSearchTextBuilder::buildSemanticText($template, tags: $template->getTags());
        if ($searchText === '') {
            throw new RuntimeException('Slides template semantic text is empty');
        }
        $payload['search_text'] = $searchText;
        $this->logger->info('Slides template semantic text prepared', [
            'resource_id' => $resourceId,
            'search_text' => $searchText,
        ]);

        $existingPoint = $this->vectorStore->getPoint($collectionName, (string) $template->getId());
        if ($existingPoint !== null) {
            // Re-embed only when search text changes or a model migration forces it.
            if ($forceReEmbedding || ($existingPoint->payload['search_text'] ?? null) !== $searchText) {
                $this->logger->info('Slides template vector re-embedding', [
                    'resource_id' => $resourceId,
                    'forced' => $forceReEmbedding,
                ]);
                $embedding = $this->generateEmbedding($dataIsolation, $searchText, $operatorId, $template);
                $this->vectorStore->storePoint($collectionName, (string) $template->getId(), $embedding, $payload);
                return;
            }

            // Keep the existing vector and refresh payload metadata when text is unchanged.
            $this->vectorStore->updatePayload($collectionName, (string) $template->getId(), $payload);
            return;
        }

        // A missing point may indicate a new template or an uncreated collection.
        $embedding = $this->generateEmbedding($dataIsolation, $searchText, $operatorId, $template);
        if ($this->vectorStore->getCollection($collectionName) === null) {
            try {
                $this->vectorStore->createCollection($collectionName, count($embedding));
            } catch (ClientException $exception) {
                // Another consumer may create the collection between the probe and create call.
                if (! $this->isCollectionAlreadyExists($exception)) {
                    throw $exception;
                }
            }
        }
        $this->vectorStore->storePoint($collectionName, (string) $template->getId(), $embedding, $payload);
        $this->logger->info('Slides template vector stored', ['resource_id' => $resourceId]);
    }

    /** Retrieve Qdrant candidates, then apply authoritative MySQL visibility checks. */
    public function search(
        SlidesTemplateDataIsolation $dataIsolation,
        SlidesTemplateQuery $query,
        Page $page,
    ): array {
        if ($query->getKeyword() === null) {
            return [];
        }

        // Normalize equivalent input so whitespace and case variants share one cache entry.
        $keyword = $this->normalizeSearchKeyword($query->getKeyword());
        if ($keyword === '') {
            return [];
        }

        $embedding = $this->embedText(
            $dataIsolation,
            $keyword,
            [
                'business_params' => [
                    'organization_id' => $dataIsolation->getCurrentOrganizationCode(),
                    'user_id' => $dataIsolation->getCurrentUserId(),
                    'business_id' => 'search:' . md5($keyword),
                    'source_id' => SourceId::SEMANTIC_SEARCH,
                ],
            ],
        );
        if ($embedding === []) {
            return [];
        }

        $pageSize = $page->getPageNum();
        $matchedOffset = $page->getSliceStart();
        $candidateOffset = 0;
        $matchedCount = 0;
        $results = [];
        $seenIds = [];
        $filter = $this->buildFilter($dataIsolation, $query);
        $scoreThreshold = (float) config('vector_index.resources.slides_template.score_threshold', 0.2);

        // Qdrant paginates candidates; scan until the requested page is filled after MySQL filtering.
        do {
            $points = $this->vectorStore->searchPoints(
                $this->collectionName(),
                $embedding,
                $pageSize,
                $scoreThreshold,
                $filter,
                $candidateOffset,
            );
            if ($points === []) {
                break;
            }
            $candidateOffset += count($points);

            $ids = [];
            foreach ($points as $point) {
                $id = (string) $point->id;
                if (! isset($seenIds[$id])) {
                    $seenIds[$id] = true;
                    $ids[] = $id;
                }
            }
            if ($ids === []) {
                continue;
            }

            // Qdrant ranks candidates; MySQL confirms organization scope and enabled status.
            $templates = $this->slidesTemplateRepository->findVisibleByIds($dataIsolation, $ids);
            $templatesById = [];
            foreach ($templates as $template) {
                $templatesById[(string) $template->getId()] = $template;
            }

            // Restore Qdrant similarity order after the repository lookup.
            foreach ($ids as $id) {
                $template = $templatesById[$id] ?? null;
                if (! $template instanceof SlidesTemplateEntity) {
                    continue;
                }
                if ($matchedCount++ < $matchedOffset) {
                    continue;
                }
                $results[] = $template;
                if (count($results) >= $pageSize) {
                    break 2;
                }
            }
        } while (count($points) === $pageSize);

        return $results;
    }

    /** Return whether vector indexing is enabled for SlidesTemplate. */
    public function isVectorSearchEnabled(): bool
    {
        return EmbeddingGenerator::isEnabled(AiAbilityCode::KnowledgeBaseEmbeddingModel);
    }

    /** Return whether the first full reconciliation has completed. */
    public function isVectorSearchReady(): bool
    {
        if (! $this->isVectorSearchEnabled()) {
            return false;
        }

        return (bool) $this->redis->exists(self::VECTOR_INDEX_INITIALIZED_KEY);
    }

    /** Record a successful full reconciliation for subsequent semantic searches. */
    public function markVectorIndexInitialized(): void
    {
        $this->redis->set(self::VECTOR_INDEX_INITIALIZED_KEY, (string) time());
    }

    /** Check whether collection creation lost a race to another consumer. */
    private function isCollectionAlreadyExists(ClientException $exception): bool
    {
        $response = $exception->getResponse();
        if ($response->getStatusCode() !== 409) {
            return false;
        }

        return str_contains(strtolower((string) $response->getBody()), 'already exists');
    }

    /** Remove the point when the configured collection exists. */
    private function removePoint(string $resourceId): void
    {
        $collectionName = $this->collectionName();
        if ($this->vectorStore->getCollection($collectionName) !== null) {
            $this->vectorStore->removePoint($collectionName, $resourceId);
        }
    }

    /** Generate a vector for a new point or changed search text. */
    private function generateEmbedding(
        SlidesTemplateDataIsolation $dataIsolation,
        string $searchText,
        string $operatorId,
        SlidesTemplateEntity $template,
    ): array {
        $embedding = $this->embedText(
            $dataIsolation,
            $searchText,
            ['business_params' => [
                'organization_id' => $dataIsolation->getCurrentOrganizationCode(),
                'user_id' => $operatorId,
                'business_id' => 'template:' . $template->getId(),
                'source_id' => SourceId::SLIDES_TEMPLATE_VECTOR_SYNC,
            ]],
        );
        if ($embedding === []) {
            throw new RuntimeException('Slides template embedding is empty');
        }

        return $embedding;
    }

    /** @param array<int, mixed> $tags */
    private function buildPayload(SlidesTemplateEntity $template, array $tags): array
    {
        return [
            'template_id' => (string) $template->getId(),
            'template_code' => $template->getCode(),
            'organization_code' => $template->getOrganizationCode(),
            'owner_type' => $template->getOwnerType()->value,
            'owner_id' => $template->getOwnerId() ?? '',
            'category_code' => $template->getCategoryCode() ?? '',
            'tag_codes' => array_values(array_map(
                static fn ($tag): string => $tag->getCode(),
                array_filter($tags, static fn ($tag): bool => $tag instanceof SlidesTemplateTagEntity),
            )),
            'status' => $template->getStatus()->value,
            'updated_at' => $template->getUpdatedAt() ?? '',
        ];
    }

    /** Convert public query conditions into Qdrant filters. */
    private function buildFilter(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): array
    {
        $must = [];
        if ($query->getCode() !== null) {
            $must[] = ['key' => 'template_code', 'value' => $query->getCode()];
        }
        if ($query->getCategoryCode() !== null) {
            $must[] = ['key' => 'category_code', 'value' => $query->getCategoryCode()];
        }
        if ($query->getStatus() !== null) {
            $must[] = ['key' => 'status', 'value' => $query->getStatus()];
        }
        if ($query->getTagCodes() !== []) {
            if ($query->getTagMatch() === SlidesTemplateTagMatch::All) {
                foreach ($query->getTagCodes() as $tagCode) {
                    $must[] = ['key' => 'tag_codes', 'value' => $tagCode];
                }
            } else {
                $must[] = ['key' => 'tag_codes', 'any' => $query->getTagCodes()];
            }
        }

        if ($query->getOwnerType() !== null) {
            $must[] = ['key' => 'owner_type', 'value' => $query->getOwnerType()->value];
            if ($query->getOwnerId() !== null) {
                $must[] = ['key' => 'owner_id', 'value' => $query->getOwnerId()];
            }
        } elseif ($query->getScope() === SlidesTemplateQueryScope::Official) {
            $must[] = ['key' => 'organization_code', 'any' => $dataIsolation->getOfficialOrganizationCodes()];
            $must[] = ['key' => 'status', 'value' => SlidesTemplateStatus::Enabled->value];
        } elseif ($query->getScope() === SlidesTemplateQueryScope::User) {
            $must = [...$must, ...$this->currentUserConditions($dataIsolation)];
        } else {
            return [
                'must' => [...$must, [
                    'should' => [
                        ['must' => [
                            ['key' => 'organization_code', 'any' => $dataIsolation->getOfficialOrganizationCodes()],
                            ['key' => 'status', 'value' => SlidesTemplateStatus::Enabled->value],
                        ]],
                        ['must' => $this->currentUserConditions($dataIsolation)],
                    ],
                ]],
            ];
        }

        return ['must' => $must];
    }

    /** Build organization and ownership conditions for personal templates. */
    private function currentUserConditions(SlidesTemplateDataIsolation $dataIsolation): array
    {
        return [
            ['key' => 'organization_code', 'value' => $dataIsolation->getCurrentOrganizationCode()],
            ['key' => 'owner_type', 'value' => SlidesTemplateOwnerType::User->value],
            ['key' => 'owner_id', 'value' => $dataIsolation->getCurrentUserId()],
        ];
    }

    /** Return the configured SlidesTemplate collection name. */
    private function collectionName(): string
    {
        return (string) config('vector_index.resources.slides_template.collection', 'slides_templates');
    }

    /** Normalize search text so equivalent inputs share one embedding cache entry. */
    private function normalizeSearchKeyword(string $keyword): string
    {
        $keyword = trim($keyword);
        $keyword = preg_replace('/\s+/u', ' ', $keyword) ?? $keyword;

        return mb_strtolower($keyword, 'UTF-8');
    }

    /** Generate embeddings through the shared knowledge-base pipeline. */
    private function embedText(
        SlidesTemplateDataIsolation $dataIsolation,
        string $text,
        array $options = [],
    ): array {
        return $this->embeddingGenerator->embedText($this->embeddingGenerator->getDefaultModel($dataIsolation), $text, $options);
    }
}
