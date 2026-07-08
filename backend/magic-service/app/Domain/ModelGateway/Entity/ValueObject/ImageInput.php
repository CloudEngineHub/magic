<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Entity\ValueObject;

use App\Infrastructure\Util\File\ImageBase64DataUriParser;
use InvalidArgumentException;

final class ImageInput
{
    public const TYPE_URL = 'url';

    public const TYPE_BASE64 = 'base64';

    private function __construct(
        private readonly string $type,
        private readonly string $value,
        private readonly ?string $mimeType = null,
        private readonly ?string $base64Data = null,
    ) {
    }

    public static function fromString(string $input): ?self
    {
        $input = trim($input);
        if ($input === '') {
            return null;
        }

        if (filter_var($input, FILTER_VALIDATE_URL)) {
            return self::fromUrl($input);
        }

        return self::fromDataUri($input);
    }

    public static function fromUrl(string $url): self
    {
        return new self(self::TYPE_URL, $url);
    }

    public static function fromDataUri(string $dataUri): ?self
    {
        try {
            $base64Image = ImageBase64DataUriParser::parseDecoded($dataUri);
        } catch (InvalidArgumentException) {
            return null;
        }

        if ($base64Image === null) {
            return null;
        }

        return new self(self::TYPE_BASE64, $dataUri, $base64Image['mime_type'], $base64Image['base64_data']);
    }

    public static function isSupported(string $input): bool
    {
        return self::fromString($input) !== null;
    }

    public function isUrl(): bool
    {
        return $this->type === self::TYPE_URL;
    }

    public function isBase64(): bool
    {
        return $this->type === self::TYPE_BASE64;
    }

    public function getType(): string
    {
        return $this->type;
    }

    public function getValue(): string
    {
        return $this->value;
    }

    public function getMimeType(): ?string
    {
        return $this->mimeType;
    }

    public function getBase64Data(): ?string
    {
        return $this->base64Data;
    }
}
