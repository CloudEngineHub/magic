<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Core\Embeddings;

use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Infrastructure\Core\Embeddings\EmbeddingGenerator\EmbeddingGenerator;
use RuntimeException;

use function Hyperf\Config\config;

/**
 * Keeps collection dimensions consistent with the configured embedding policy.
 *
 * The switch is the vector search master switch: it is combined with the original AI ability
 * switch ({@see AiAbilityCode::KnowledgeBaseEmbeddingModel}), so vector search is active only
 * when both the ability and this switch are on. The switch defaults to on, so nothing changes
 * unless it is explicitly turned off.
 *
 * When vector search is inactive, no embedding is written. When it is active, collection creation
 * and dimension validation both use the configured size and reject model output drift before
 * writing to the vector store.
 */
final class EmbeddingDimensionPolicy
{
    /**
     * 向量搜索总开关（配置层原始值）。
     *
     * 默认开启；显式置为 false 即关闭向量搜索，各市场的检索会回落到关键词搜索。
     */
    public static function isSwitchOn(): bool
    {
        return (bool) config('vector_index.enabled', true);
    }

    /**
     * 向量搜索是否生效。
     *
     * 在原有「向量搜索 AI 能力」的基础上叠加总开关，两个条件都满足才生效：
     * 1. AI 能力 KnowledgeBaseEmbeddingModel 已启用（原先的判断依据）；
     * 2. VECTOR_INDEX_ENABLED 已打开（默认打开）。
     *
     * 三个 Domain Service 的 isVectorSearchEnabled() 统一复用本方法，避免两套口径。
     */
    public static function isEnabled(): bool
    {
        return self::isSwitchOn()
            && EmbeddingGenerator::isEnabled(AiAbilityCode::KnowledgeBaseEmbeddingModel);
    }

    /** Return the configured fixed vector size. */
    public static function fixedSize(): int
    {
        return (int) config('vector_index.embedding_dimension.size', 2048);
    }

    /** Resolve the dimension to use when creating a collection. */
    public static function resolveCollectionSize(string $business, int $actualSize): int
    {
        self::assertModelOutput($business, $actualSize);

        return self::isEnabled() ? self::fixedSize() : $actualSize;
    }

    /** Reject model output that violates the fixed dimension policy. */
    public static function assertModelOutput(string $business, int $actualSize): void
    {
        if (! self::isEnabled()) {
            return;
        }

        $fixedSize = self::fixedSize();
        if ($actualSize !== $fixedSize) {
            throw new RuntimeException(sprintf(
                '%s embedding dimension mismatch: model returned %d but %d is expected',
                $business,
                $actualSize,
                $fixedSize,
            ));
        }
    }

    /** Reject an existing collection whose dimension differs from the expected size. */
    public static function assertCollectionSize(string $business, int $collectionSize, int $expectedSize): void
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
}
