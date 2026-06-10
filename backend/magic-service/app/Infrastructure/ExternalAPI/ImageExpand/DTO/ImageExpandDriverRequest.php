<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageExpand\DTO;

use App\Domain\ModelGateway\Entity\ValueObject\ImageInput;

class ImageExpandDriverRequest
{
    public function __construct(
        private readonly ImageInput $imageInput,
        private readonly ImageInput $maskInput,
        private readonly ?string $customPrompt,
        private readonly ?int $steps,
        private readonly ?float $strength,
        private readonly ?float $scale,
        private readonly ?int $seed,
        private readonly ?float $top,
        private readonly ?float $bottom,
        private readonly ?float $left,
        private readonly ?float $right,
        private readonly ?int $maxHeight,
        private readonly ?int $maxWidth,
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

    public function getCustomPrompt(): ?string
    {
        return $this->customPrompt;
    }

    public function getSteps(): ?int
    {
        return $this->steps;
    }

    public function getStrength(): ?float
    {
        return $this->strength;
    }

    public function getScale(): ?float
    {
        return $this->scale;
    }

    public function getSeed(): ?int
    {
        return $this->seed;
    }

    public function getTop(): ?float
    {
        return $this->top;
    }

    public function getBottom(): ?float
    {
        return $this->bottom;
    }

    public function getLeft(): ?float
    {
        return $this->left;
    }

    public function getRight(): ?float
    {
        return $this->right;
    }

    public function getMaxHeight(): ?int
    {
        return $this->maxHeight;
    }

    public function getMaxWidth(): ?int
    {
        return $this->maxWidth;
    }
}
