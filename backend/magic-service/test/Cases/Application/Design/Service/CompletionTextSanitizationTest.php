<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Design\Service;

use App\Application\Design\Service\ImagePromptCompletionAppService;
use App\Application\Design\Service\TextContentCompletionAppService;
use JsonException;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * @internal
 */
class CompletionTextSanitizationTest extends TestCase
{
    /**
     * @throws JsonException
     */
    public function testSanitizersPreserveValidUtf8AtTextBoundaries(): void
    {
        foreach ($this->sanitizerTargets() as [$className, $methodName]) {
            $this->assertSanitizedValue($className, $methodName, '优化一', '优化一');
            $this->assertSanitizedValue($className, $methodName, '“优化一”', '优化一');
            $this->assertSanitizedValue($className, $methodName, '‘优化优’', '优化优');
        }
    }

    /**
     * @throws JsonException
     */
    public function testSanitizersKeepLiteralBackslashHexSequences(): void
    {
        foreach ($this->sanitizerTargets() as [$className, $methodName]) {
            $this->assertSanitizedValue($className, $methodName, '路径 C:\x80', '路径 C:\x80');
        }
    }

    /**
     * @return list<array{class-string, string}>
     */
    private function sanitizerTargets(): array
    {
        return [
            [TextContentCompletionAppService::class, 'sanitizeText'],
            [ImagePromptCompletionAppService::class, 'sanitizePrompt'],
        ];
    }

    /**
     * @param class-string $className
     * @throws JsonException
     */
    private function assertSanitizedValue(
        string $className,
        string $methodName,
        string $input,
        string $expected,
    ): void {
        $service = (new ReflectionClass($className))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod($className, $methodName);

        $result = $method->invoke($service, $input);

        $this->assertSame($expected, $result);
        $this->assertTrue(mb_check_encoding($result, 'UTF-8'));
        $this->assertIsString(json_encode(['text' => $result], JSON_THROW_ON_ERROR));
    }
}
