<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service;

use App\Domain\ModelGateway\Entity\ValueObject\SourceId;
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
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGeneratorInterface;
use App\Infrastructure\Core\Embeddings\VectorStores\VectorStoreInterface;
use App\Infrastructure\Core\ValueObject\Page;
use GuzzleHttp\Exception\ClientException;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Throwable;

final class SlidesTemplateVectorIndexDomainService
{
    private ?bool $availabilityCache = null;

    private int $availabilityCacheExpiresAt = 0;

    private LoggerInterface $logger;

    public function __construct(
        private readonly SlidesTemplateRepositoryInterface $slidesTemplateRepository,
        private readonly SlidesTemplateTagRelationRepositoryInterface $slidesTemplateTagRelationRepository,
        private readonly VectorStoreInterface $vectorStore,
        private readonly EmbeddingGeneratorInterface $embeddingGenerator,
        LoggerFactory $loggerFactory,
    ) {
        $this->logger = $loggerFactory?->get('vector-index-sync');
    }

    /** Cache the Qdrant collection probe briefly so an outage does not delay every search request. */
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

    /** Synchronize one template using the latest MySQL state and the smallest required Qdrant operation. */
    public function sync(
        SlidesTemplateDataIsolation $dataIsolation,
        string $resourceId,
        string $operatorId,
    ): void {
        if (! $this->isVectorSearchEnabled()) {
            return;
        }

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
            return;
        }

        $tagMap = $this->slidesTemplateTagRelationRepository->findTagsByTemplateIds(
            $dataIsolation,
            [(int) $template->getId()],
            SlidesTemplateTagStatus::Enabled->value,
        );
        $template->setTags($tagMap[(int) $template->getId()] ?? []);
        $payload = $this->buildPayload($template, $template->getTags());
        $searchText = trim((string) $template->getSearchText());
        if ($searchText === '') {
            throw new RuntimeException('Slides template search text is empty');
        }
        $payload['search_text'] = $searchText;

        $collectionName = $this->collectionName();
        $existingPoint = $this->vectorStore->getPoint($collectionName, (string) $template->getId());
        if ($existingPoint !== null) {
            // Only search text changes require a paid embedding call; metadata changes reuse the stored vector.
            if (($existingPoint->payload['search_text'] ?? null) !== $searchText) {
                $embedding = $this->generateEmbedding($dataIsolation, $searchText, $operatorId, $template);
                $this->vectorStore->storePoint($collectionName, (string) $template->getId(), $embedding, $payload);
                return;
            }

            // Metadata writes are cheap and keep Qdrant synchronized with the latest MySQL state.
            $this->vectorStore->updatePayload($collectionName, (string) $template->getId(), $payload);
            return;
        }

        // A missing point may mean either a new template or an uncreated collection.
        $embedding = $this->generateEmbedding($dataIsolation, $searchText, $operatorId, $template);
        if ($this->vectorStore->getCollection($collectionName) === null) {
            try {
                $this->vectorStore->createCollection($collectionName, count($embedding));
            } catch (ClientException $exception) {
                // Another consumer may have created the collection between the probe and create.
                if (! $this->isCollectionAlreadyExists($exception)) {
                    throw $exception;
                }
            }
        }
        $this->vectorStore->storePoint($collectionName, (string) $template->getId(), $embedding, $payload);
    }

    /** Search Qdrant with all public filters applied before returning IDs. */
    public function search(
        SlidesTemplateDataIsolation $dataIsolation,
        SlidesTemplateQuery $query,
        Page $page,
    ): array {
        if ($query->getKeyword() === null) {
            return [];
        }

        // Normalize equivalent user input before embedding so cache keys are reused.
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

        $points = $this->vectorStore->searchPoints(
            $this->collectionName(),
            $embedding,
            $page->getPageNum(),
            (float) config('vector_index.resources.slides_template.score_threshold', 0.2),
            $this->buildFilter($dataIsolation, $query),
            $page->getSliceStart(),
        );

        $ids = array_values(array_map(static fn ($point): string => (string) $point->id, $points));
        if ($ids === []) {
            return [];
        }

        $templates = $this->slidesTemplateRepository->findByIds($dataIsolation, $ids);
        $templatesById = [];
        foreach ($templates as $template) {
            $templatesById[(string) $template->getId()] = $template;
        }

        // Repository lookup may return rows in database order; restore Qdrant similarity order here.
        return array_values(array_filter(array_map(
            static fn (string $id): ?SlidesTemplateEntity => $templatesById[$id] ?? null,
            $ids,
        )));
    }

    /** Return whether vector indexing is enabled for SlidesTemplate. */
    public function isVectorSearchEnabled(): bool
    {
        return (bool) config('vector_index.enabled', false)
            && (bool) config('vector_index.resources.slides_template.enabled', false);
    }

    /** Return whether Qdrant rejected creation because another consumer won the race. */
    private function isCollectionAlreadyExists(ClientException $exception): bool
    {
        $response = $exception->getResponse();
        if ($response->getStatusCode() !== 409) {
            return false;
        }

        return str_contains(strtolower((string) $response->getBody()), 'already exists');
    }

    /** Remove the point only when the configured collection already exists. */
    private function removePoint(string $resourceId): void
    {
        $collectionName = $this->collectionName();
        if ($this->vectorStore->getCollection($collectionName) !== null) {
            $this->vectorStore->removePoint($collectionName, $resourceId);
        }
    }

    /** Generate a vector only when the point is missing or search text changed. */
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

    /** Convert all public query conditions into Qdrant-side strict filters. */
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
                'must' => $must,
                'should' => [
                    ['must' => [
                        ['key' => 'organization_code', 'any' => $dataIsolation->getOfficialOrganizationCodes()],
                        ['key' => 'status', 'value' => SlidesTemplateStatus::Enabled->value],
                    ]],
                    ['must' => $this->currentUserConditions($dataIsolation)],
                ],
            ];
        }

        return ['must' => $must];
    }

    /** Build the organization and ownership conditions for personal templates. */
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

    /** Normalize search text so whitespace and letter-case variants share one embedding cache entry. */
    private function normalizeSearchKeyword(string $keyword): string
    {
        $keyword = trim($keyword);
        $keyword = preg_replace('/\s+/u', ' ', $keyword) ?? $keyword;

        return mb_strtolower($keyword, 'UTF-8');
    }

    /** Generate an embedding through the shared knowledge-base embedding pipeline. */
    private function embedText(
        SlidesTemplateDataIsolation $dataIsolation,
        string $text,
        array $options = [],
    ): array {
        return $this->embeddingGenerator->embedText($this->embeddingGenerator->getDefaultModel($dataIsolation), $text, $options);
    }
}
