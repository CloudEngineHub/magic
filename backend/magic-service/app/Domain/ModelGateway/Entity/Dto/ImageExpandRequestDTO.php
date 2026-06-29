<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Entity\Dto;

use App\ErrorCode\MagicApiErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;

class ImageExpandRequestDTO extends AbstractImageOperationRequestDTO
{
    protected string $imageUrl = '';

    protected string $maskUrl = '';

    protected ?string $prompt = null;

    protected ?int $steps = null;

    protected ?float $strength = null;

    protected ?float $scale = null;

    protected ?int $seed = null;

    protected ?float $top = null;

    protected ?float $bottom = null;

    protected ?float $left = null;

    protected ?float $right = null;

    protected ?int $maxHeight = null;

    protected ?int $maxWidth = null;

    public function __construct(array $requestData = [])
    {
        $this->initRequestData($requestData, [
            'image_url',
            'mask_url',
            'prompt',
            'custom_prompt',
            'steps',
            'strength',
            'seed',
            'scale',
            'top',
            'bottom',
            'left',
            'right',
            'max_height',
            'max_width',
            'generate_config',
        ]);

        $this->imageUrl = (string) ($requestData['image_url'] ?? '');
        $this->maskUrl = (string) ($requestData['mask_url'] ?? '');
        $this->prompt = $this->resolvePrompt($requestData);
        $this->steps = $this->nullableGenerateConfigOrFieldInt('steps');
        $this->strength = $this->nullableGenerateConfigOrFieldFloat('strength');
        $this->seed = $this->nullableGenerateConfigOrFieldInt('seed');
        $this->scale = $this->nullableGenerateConfigFloat('scale');
        $this->top = $this->nullableGenerateConfigFloat('top');
        $this->bottom = $this->nullableGenerateConfigFloat('bottom');
        $this->left = $this->nullableGenerateConfigFloat('left');
        $this->right = $this->nullableGenerateConfigFloat('right');
        $this->maxHeight = $this->nullableGenerateConfigInt('max_height');
        $this->maxWidth = $this->nullableGenerateConfigInt('max_width');
    }

    public function getImageUrl(): string
    {
        return $this->imageUrl;
    }

    public function getMaskUrl(): string
    {
        return $this->maskUrl;
    }

    public function getPrompt(): ?string
    {
        return $this->prompt;
    }

    public function getCustomPrompt(): ?string
    {
        return $this->prompt;
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

    public function getType(): string
    {
        return 'image_expand';
    }

    public function valid(): void
    {
        if ($this->imageUrl === '') {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.empty', ['label' => 'image_url']);
        }
        if ($this->maskUrl === '') {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.empty', ['label' => 'mask_url']);
        }
        $this->assertGenerateConfig();
        $this->assertImageInputField('image_url', $this->imageUrl);
        $this->assertImageInputField('mask_url', $this->maskUrl);
        $this->assertGenerateConfigOrFieldIntField('steps', 1);
        $this->assertGenerateConfigOrFieldFloatField('strength', 0.1, 1.0);
        $this->assertGenerateConfigOrFieldIntField('seed');
        $this->assertProviderOptionsInGenerateConfig([
            'scale',
            'top',
            'bottom',
            'left',
            'right',
            'max_height',
            'max_width',
        ]);
        $this->assertGenerateConfigFloatField('scale', 1, 20);
        foreach (['top', 'bottom', 'left', 'right'] as $label) {
            $this->assertGenerateConfigFloatField($label, 0, 1);
        }
        $this->assertGenerateConfigIntField('max_height', 1);
        $this->assertGenerateConfigIntField('max_width', 1);
    }

    private function resolvePrompt(array $requestData): ?string
    {
        if ($this->hasFilledValue('prompt')) {
            return trim((string) $requestData['prompt']);
        }
        if ($this->hasFilledValue('custom_prompt')) {
            return trim((string) $requestData['custom_prompt']);
        }

        return null;
    }
}
