<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageEraser\DTO;

class ImageEraserDriverRequest
{
    public function __construct(
        private readonly string $imageUrl,
        private readonly string $maskUrl,
        private readonly ?int $steps,
        private readonly ?float $strength,
        private readonly ?int $seed,
        private readonly ?int $dilateSize,
        private readonly ?string $quality,
    ) {
    }

    public function getImageUrl(): string
    {
        return $this->imageUrl;
    }

    public function getMaskUrl(): string
    {
        return $this->maskUrl;
    }

    public function getSteps(): ?int
    {
        return $this->steps;
    }

    public function getStrength(): ?float
    {
        return $this->strength;
    }

    public function getSeed(): ?int
    {
        return $this->seed;
    }

    public function getDilateSize(): ?int
    {
        return $this->dilateSize;
    }

    public function getQuality(): ?string
    {
        return $this->quality;
    }
}
