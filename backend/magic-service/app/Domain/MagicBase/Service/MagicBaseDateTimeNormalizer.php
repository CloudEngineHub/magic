<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use DateTimeImmutable;

final readonly class MagicBaseDateTimeNormalizer
{
    private const FORMATS = [
        '/^\d{4}-\d{2}-\d{2}$/' => '!Y-m-d',
        '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/' => '!Y-m-d H:i',
        '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/' => '!Y-m-d H:i:s',
        '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/' => '!Y-m-d\TH:i',
        '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/' => '!Y-m-d\TH:i:s',
    ];

    public static function normalize(mixed $value): ?string
    {
        $normalized = is_string($value) ? trim($value) : '';
        if ($normalized === '') {
            return null;
        }

        foreach (self::FORMATS as $pattern => $format) {
            if (preg_match($pattern, $normalized) !== 1) {
                continue;
            }

            $date = DateTimeImmutable::createFromFormat($format, $normalized);
            $errors = DateTimeImmutable::getLastErrors();
            if (
                $date === false
                || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
            ) {
                return null;
            }
            return $date->format('Y-m-d H:i:s');
        }

        return null;
    }
}
