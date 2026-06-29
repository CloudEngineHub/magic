<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Util\File;

use InvalidArgumentException;

final class ImageBase64DataUriParser
{
    private const DATA_URI_PATTERN = '#^data:(?<mime_type>image/(?:png|jpe?g|webp|gif));base64,(?<data>.*)$#is';

    /**
     * Parse a supported image data URI; return null for normal URLs or unsupported strings.
     *
     * @return null|array{mime_type:string, extension:string, base64_data:string, binary_data?:string}
     */
    public static function parse(string $image, bool $decode = false): ?array
    {
        if (preg_match(self::DATA_URI_PATTERN, $image, $matches) !== 1) {
            return null;
        }

        $mimeType = self::normalizeMimeType(strtolower((string) $matches['mime_type']));
        $base64Data = preg_replace('/\s+/', '', (string) $matches['data']);
        if (! is_string($base64Data) || $base64Data === '') {
            return null;
        }

        $result = [
            'mime_type' => $mimeType,
            'extension' => self::extensionFromMimeType($mimeType),
            'base64_data' => $base64Data,
        ];

        if ($decode) {
            $binaryData = base64_decode($base64Data, true);
            if ($binaryData === false || $binaryData === '') {
                throw new InvalidArgumentException('Invalid base64 image data');
            }
            $result['binary_data'] = $binaryData;
        }

        return $result;
    }

    /**
     * Parse and decode a supported image data URI.
     *
     * @return null|array{mime_type:string, extension:string, base64_data:string, binary_data:string}
     */
    public static function parseDecoded(string $image): ?array
    {
        $result = self::parse($image, true);
        if ($result === null) {
            return null;
        }

        /* @var array{mime_type:string, extension:string, base64_data:string, binary_data:string} $result */
        return $result;
    }

    public static function isValid(string $image): bool
    {
        try {
            return self::parseDecoded($image) !== null;
        } catch (InvalidArgumentException) {
            return false;
        }
    }

    public static function normalizeMimeType(string $mimeType): string
    {
        return $mimeType === 'image/jpg' ? 'image/jpeg' : $mimeType;
    }

    private static function extensionFromMimeType(string $mimeType): string
    {
        return match ($mimeType) {
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }
}
