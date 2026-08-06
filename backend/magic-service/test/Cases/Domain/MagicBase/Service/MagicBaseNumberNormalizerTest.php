<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\MagicBase\Service;

use App\Domain\MagicBase\Service\MagicBaseNumberNormalizer;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class MagicBaseNumberNormalizerTest extends TestCase
{
    public function testNormalizesFiniteNumbersAndRejectsNonFiniteValues(): void
    {
        $this->assertSame(5999, MagicBaseNumberNormalizer::normalize('5999'));
        $this->assertSame(59.99, MagicBaseNumberNormalizer::normalize('59.99'));
        $this->assertNull(MagicBaseNumberNormalizer::normalize('1e309'));
        $this->assertNull(MagicBaseNumberNormalizer::normalize(INF));
        $this->assertNull(MagicBaseNumberNormalizer::normalize(NAN));
        $this->assertNull(MagicBaseNumberNormalizer::normalize('not-a-number'));
    }
}
