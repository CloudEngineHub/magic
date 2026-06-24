<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Event\Subscribe;

use App\Application\Design\Event\Subscribe\DesignImageGenerationSubscriber;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * @internal
 */
class DesignImageGenerationSubscriberTest extends TestCase
{
    public function testBuildImageCompletionPayloadStoresSingleImageAndEmptyTaskFileName(): void
    {
        $payload = $this->buildImageCompletionPayload('poster', [
            'https://example.test/generated/first.png',
        ], '/workspace/design');

        $this->assertSame('', $payload['file_name']);
        $this->assertSame([
            [
                'index' => 1,
                'file_name' => 'poster.png',
                'file_path' => '/workspace/design/poster.png',
            ],
        ], $payload['output_images']);
    }

    public function testBuildImageCompletionPayloadUsesPerImagePathAndEmptyTaskFileName(): void
    {
        $payload = $this->buildImageCompletionPayload('poster', [
            'https://example.test/generated/first.png',
            'https://example.test/generated/second.webp',
        ], '/workspace/design');

        $this->assertSame('', $payload['file_name']);
        $this->assertSame([
            [
                'index' => 1,
                'file_name' => 'poster.png',
                'file_path' => '/workspace/design/poster.png',
            ],
            [
                'index' => 2,
                'file_name' => 'poster_2.webp',
                'file_path' => '/workspace/design/poster_2.webp',
            ],
        ], $payload['output_images']);
    }

    private function buildImageCompletionPayload(string $baseName, array $imageUrls, string $fileDir): array
    {
        $reflection = new ReflectionClass(DesignImageGenerationSubscriber::class);
        $subscriber = $reflection->newInstanceWithoutConstructor();
        $method = $reflection->getMethod('buildImageCompletionPayload');

        return $method->invoke($subscriber, $baseName, $imageUrls, $fileDir);
    }
}
