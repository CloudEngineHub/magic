<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageEraser\DTO;

use App\Domain\ModelGateway\Entity\ValueObject\ImageInput;

class ImageEraserDriverRequest
{
    public function __construct(
        private readonly ImageInput $imageInput,
        private readonly ImageInput $maskInput,
        private readonly ?int $steps,
        private readonly ?float $strength,
        private readonly ?int $seed,
        private readonly ?int $dilateSize,
        private readonly ?string $quality,
    ) {
    }

    public function getImageUrl(): string
    {
        return $this->imageInput->getValue();
    }

    public function getMaskUrl(): string
    {
        return $this->maskInput->getValue();
    }

    public function getImageInput(): ImageInput
    {
        return $this->imageInput;
    }

    public function getMaskInput(): ImageInput
    {
        return $this->maskInput;
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
