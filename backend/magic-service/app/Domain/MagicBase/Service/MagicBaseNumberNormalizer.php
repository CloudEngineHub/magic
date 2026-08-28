<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

final readonly class MagicBaseNumberNormalizer
{
    public static function normalize(mixed $value): null|float|int
    {
        if (! is_int($value) && ! is_float($value) && ! (is_string($value) && is_numeric($value))) {
            return null;
        }

        $number = $value + 0;
        if (! is_finite((float) $number)) {
            return null;
        }

        return is_int($number) ? $number : (float) $number;
    }
}
