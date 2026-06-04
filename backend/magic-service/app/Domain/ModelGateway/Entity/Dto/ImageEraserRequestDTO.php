<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Entity\Dto;

use App\ErrorCode\MagicApiErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;

class ImageEraserRequestDTO extends AbstractImageOperationRequestDTO
{
    protected string $imageUrl = '';

    protected string $maskUrl = '';

    protected ?int $steps = null;

    protected ?float $strength = null;

    protected ?int $seed = null;

    protected ?int $dilateSize = null;

    protected ?string $quality = null;

    public function __construct(array $requestData = [])
    {
        $this->initRequestData($requestData, [
            'image_url',
            'mask_url',
            'steps',
            'strength',
            'seed',
            'dilate_size',
            'quality',
            'generate_config',
        ]);

        $this->imageUrl = (string) ($requestData['image_url'] ?? '');
        $this->maskUrl = (string) ($requestData['mask_url'] ?? '');
        $this->steps = $this->nullableInt('steps');
        $this->strength = $this->nullableFloat('strength');
        $this->seed = $this->nullableInt('seed');
        $this->dilateSize = $this->nullableGenerateConfigInt('dilate_size');
        $this->quality = $this->hasGenerateConfigValue('quality') ? strtoupper(trim((string) $this->generateConfig['quality'])) : null;
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

    public function getType(): string
    {
        return 'image_eraser';
    }

    public function valid(): void
    {
        if ($this->imageUrl === '') {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.empty', ['label' => 'image_url']);
        }
        if ($this->maskUrl === '') {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.empty', ['label' => 'mask_url']);
        }
        if (! filter_var($this->imageUrl, FILTER_VALIDATE_URL)) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => 'image_url']);
        }
        if (! filter_var($this->maskUrl, FILTER_VALIDATE_URL)) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => 'mask_url']);
        }
        $this->assertIntField('steps', 1);
        $this->assertFloatField('strength', 0.1, 1.0);
        $this->assertIntField('seed');
        $this->assertGenerateConfig();
        $this->assertProviderOptionsInGenerateConfig(['dilate_size', 'quality']);
        $this->assertGenerateConfigIntField('dilate_size', 0);
        if ($this->quality !== null && ! in_array($this->quality, ['H', 'M', 'L'], true)) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => 'generate_config.quality']);
        }
    }
}
