<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\ExternalAPI\FileUrlProxy;

use App\Infrastructure\ExternalAPI\FileUrlProxy\TemporaryFileUrlProxyManager;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 * @covers \App\Infrastructure\ExternalAPI\FileUrlProxy\TemporaryFileUrlProxyManager
 */
final class TemporaryFileUrlProxyManagerTest extends TestCase
{
    public function testPrepareCreatesProxyForHttpFileUrlsOnlyAndCleanupDeletesThem(): void
    {
        $shortUrl = 'https://short-url.pages.letsmagic.space/17829009419c4bbeb3';
        $history = [];
        $mock = new MockHandler([
            new Response(200, [], $shortUrl),
            new Response(204),
        ]);
        $manager = new TemporaryFileUrlProxyManager(
            'https://short-url.pages.letsmagic.space',
            $this->createClient($mock, $history)
        );

        $fileUrl = 'https://magic-sandbox.tos-cn-beijing.volces.com/path/input.png?X-Tos-Signature=abc';
        $base64File = 'data:image/png;base64,' . base64_encode('image-binary');
        $nonHttpFile = 'gs://bucket/input.png';
        $createUrl = 'https://short-url.pages.letsmagic.space/' . $fileUrl;

        $result = $manager->prepare([$fileUrl, $base64File, $nonHttpFile]);

        $this->assertSame([$shortUrl, $base64File, $nonHttpFile], $result['urls']);
        $this->assertSame([$shortUrl], $result['proxy_urls']);

        $manager->cleanup($result['proxy_urls']);

        $this->assertSame('PUT', $history[0]['request']->getMethod());
        $this->assertSame($createUrl, (string) $history[0]['request']->getUri());
        $this->assertSame('DELETE', $history[1]['request']->getMethod());
        $this->assertSame($shortUrl, (string) $history[1]['request']->getUri());
        $this->assertSame(0, $mock->count());
    }

    public function testPrepareDoesNothingWhenProxyBaseUrlIsEmpty(): void
    {
        $mock = new MockHandler();
        $manager = new TemporaryFileUrlProxyManager('', $this->createClient($mock));

        $fileUrl = 'https://example.com/input.png';
        $result = $manager->prepare([$fileUrl]);

        $this->assertSame([$fileUrl], $result['urls']);
        $this->assertSame([], $result['proxy_urls']);
        $this->assertSame(0, $mock->count());
    }

    public function testPrepareCreatesProxyOnceForDuplicatedFileUrls(): void
    {
        $shortUrl = 'https://short-url.pages.letsmagic.space/17829009419c4bbeb3';
        $mock = new MockHandler([
            new Response(200, [], $shortUrl),
        ]);
        $manager = new TemporaryFileUrlProxyManager(
            'https://short-url.pages.letsmagic.space/',
            $this->createClient($mock)
        );

        $fileUrl = 'https://example.com/input.png';
        $result = $manager->prepare([$fileUrl, $fileUrl]);

        $this->assertSame([$shortUrl, $shortUrl], $result['urls']);
        $this->assertSame([$shortUrl], $result['proxy_urls']);
        $this->assertSame(0, $mock->count());
    }

    public function testPrepareFallsBackToOriginalFileUrlsWhenCreateProxyFails(): void
    {
        $mock = new MockHandler([
            new Response(403),
        ]);
        $manager = new TemporaryFileUrlProxyManager(
            'https://short-url.pages.letsmagic.space',
            $this->createClient($mock)
        );

        $fileUrl = 'https://example.com/input.png';
        $result = $manager->prepare([$fileUrl]);

        $this->assertSame([$fileUrl], $result['urls']);
        $this->assertSame([], $result['proxy_urls']);
        $this->assertSame(0, $mock->count());
    }

    /**
     * @param array<int, array<string, mixed>> $history
     */
    private function createClient(MockHandler $mock, array &$history = []): Client
    {
        $handlerStack = HandlerStack::create($mock);
        $handlerStack->push(Middleware::history($history));

        return new Client([
            'handler' => $handlerStack,
            'http_errors' => false,
        ]);
    }
}
