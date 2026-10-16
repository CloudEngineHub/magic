<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\Util\ShadowCode;

use App\Infrastructure\Util\ShadowCode\ShadowCode;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class ShadowCodeEquivalenceTest extends TestCase
{
    public function testShadowMatchesOriginalByteLoop(): void
    {
        foreach ($this->samples() as $sample) {
            self::assertSame($this->legacyShadow($sample), ShadowCode::shadow($sample));
        }
    }

    public function testUnShadowMatchesOriginalByteLoop(): void
    {
        foreach ($this->samples() as $sample) {
            $shadowed = ShadowCode::PREFIX . $sample;
            self::assertSame($this->legacyUnShadow($shadowed), ShadowCode::unShadow($shadowed));
        }
    }

    public function testRoundTripAndAllBytes(): void
    {
        $allBytes = implode('', array_map('chr', range(0, 255)));
        self::assertSame($allBytes, ShadowCode::unShadow(ShadowCode::shadow($allBytes)));
        self::assertSame('', ShadowCode::unShadow(ShadowCode::shadow('')));
    }

    public function testInputWithoutPrefixIsReturnedUntouched(): void
    {
        self::assertSame('{"a":1}', ShadowCode::unShadow('{"a":1}'));
    }

    private function samples(): array
    {
        mt_srand(42);
        $samples = ['', 'a', '{"metadata":{"topic_id":"1"}}', '中文 emoji 😀 <?php echo 1; ?>'];
        for ($i = 0; $i < 20; ++$i) {
            $samples[] = random_bytes(mt_rand(1, 4096));
        }
        return $samples;
    }

    private function legacyShadow(string $input): string
    {
        for ($i = 0; $i < strlen($input); ++$i) {
            $input[$i] = chr(ShadowCode::shuffleMap[ord($input[$i])]);
        }
        return ShadowCode::PREFIX . $input;
    }

    private function legacyUnShadow(string $input): string
    {
        $input = substr($input, strlen(ShadowCode::PREFIX));
        for ($i = 0; $i < strlen($input); ++$i) {
            $input[$i] = chr(ShadowCode::unShuffleMap[ord($input[$i])]);
        }
        return $input;
    }
}
