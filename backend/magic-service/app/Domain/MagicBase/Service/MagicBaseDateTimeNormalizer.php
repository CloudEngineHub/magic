<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use DateTimeImmutable;
use DateTimeZone;

final readonly class MagicBaseDateTimeNormalizer
{
    private const FORMATS = [
        '/^\d{4}-\d{2}-\d{2}$/' => '!Y-m-d',
        '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/' => '!Y-m-d H:i',
        '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/' => '!Y-m-d H:i:s',
        '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/' => '!Y-m-d\TH:i',
        '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/' => '!Y-m-d\TH:i:s',
    ];

    private const TIMEZONE_FORMATS = [
        '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}(?:Z|[+-]\d{2}:\d{2})$/' => '!Y-m-d\TH:i:s.uP',
        '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/' => '!Y-m-d\TH:i:sP',
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

            return self::parse($format, $normalized)?->format('Y-m-d H:i:s');
        }

        foreach (self::TIMEZONE_FORMATS as $pattern => $format) {
            if (preg_match($pattern, $normalized) !== 1) {
                continue;
            }

            return self::parse($format, $normalized)
                ?->setTimezone(new DateTimeZone(date_default_timezone_get()))
                ->format('Y-m-d H:i:s');
        }

        return null;
    }

    private static function parse(string $format, string $value): ?DateTimeImmutable
    {
        $date = DateTimeImmutable::createFromFormat($format, $value);
        $errors = DateTimeImmutable::getLastErrors();
        if (
            $date === false
            || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        ) {
            return null;
        }
        return $date;
    }
}
