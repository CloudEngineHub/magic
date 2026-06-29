<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Infrastructure\Util\File;

use App\Infrastructure\Util\File\ImageBase64DataUriParser;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
final class ImageBase64DataUriParserTest extends TestCase
{
    public function testParseDecodedSupportedDataUri(): void
    {
        $binary = 'image-binary';
        $result = ImageBase64DataUriParser::parseDecoded('data:image/png;base64,' . base64_encode($binary));

        $this->assertIsArray($result);
        $this->assertSame('image/png', $result['mime_type']);
        $this->assertSame('png', $result['extension']);
        $this->assertSame(base64_encode($binary), $result['base64_data']);
        $this->assertSame($binary, $result['binary_data']);
    }

    public function testParseReturnsNullForUrl(): void
    {
        $this->assertNull(ImageBase64DataUriParser::parse('https://example.com/input.jpg'));
    }

    public function testRejectsInvalidBase64(): void
    {
        $this->assertFalse(ImageBase64DataUriParser::isValid('data:image/jpeg;base64,invalid-base64'));
    }

    public function testNormalizesJpgMimeType(): void
    {
        $result = ImageBase64DataUriParser::parseDecoded('data:image/jpg;base64,' . base64_encode('jpg-binary'));

        $this->assertIsArray($result);
        $this->assertSame('image/jpeg', $result['mime_type']);
        $this->assertSame('jpg', $result['extension']);
    }

    public function testRemovesWhitespaceFromBase64Data(): void
    {
        $result = ImageBase64DataUriParser::parseDecoded("data:image/webp;base64,\n" . chunk_split(base64_encode('webp-binary'), 4, "\n"));

        $this->assertIsArray($result);
        $this->assertSame('image/webp', $result['mime_type']);
        $this->assertSame('webp', $result['extension']);
        $this->assertSame(base64_encode('webp-binary'), $result['base64_data']);
        $this->assertSame('webp-binary', $result['binary_data']);
    }
}
