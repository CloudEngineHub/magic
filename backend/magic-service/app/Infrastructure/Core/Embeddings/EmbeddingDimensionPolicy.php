<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Core\Embeddings;

use RuntimeException;

/**
 * Keeps collection dimensions consistent with the configured embedding policy.
 *
 * When disabled, the legacy behavior is preserved: model metadata is used for validation and
 * the actual embedding length is used when creating a collection. When enabled, both operations
 * use the configured size and reject model output drift before writing to the vector store.
 */
final class EmbeddingDimensionPolicy
{
    /** Return whether the fixed dimension policy is enabled. */
    public static function isEnabled(): bool
    {
        return (bool) config('vector_index.embedding_dimension.enabled', false);
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
