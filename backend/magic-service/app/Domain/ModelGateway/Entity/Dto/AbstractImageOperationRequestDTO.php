<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Entity\Dto;

use App\Domain\ModelGateway\Entity\ValueObject\ImageInput;
use App\ErrorCode\MagicApiErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;

abstract class AbstractImageOperationRequestDTO extends AbstractRequestDTO
{
    protected array $requestData = [];

    /**
     * @var array<string, mixed>
     */
    protected array $generateConfig = [];

    /**
     * @return array<string, mixed>
     */
    public function getGenerateConfig(): array
    {
        return $this->generateConfig;
    }

    /**
     * @param list<string> $operationKeys
     */
    protected function initRequestData(array $requestData, array $operationKeys): void
    {
        $this->requestData = $requestData;
        $generateConfig = $requestData['generate_config'] ?? [];
        $this->generateConfig = is_array($generateConfig) ? $generateConfig : [];

        $hydrateData = $requestData;
        foreach ($operationKeys as $key) {
            unset($hydrateData[$key]);
        }

        parent::__construct($hydrateData);
    }

    protected function nullableInt(string $key): ?int
    {
        if (! $this->hasFilledValue($key)) {
            return null;
        }

        $value = filter_var($this->requestData[$key], FILTER_VALIDATE_INT);
        return $value === false ? null : (int) $value;
    }

    protected function nullableFloat(string $key): ?float
    {
        if (! $this->hasFilledValue($key)) {
            return null;
        }

        return is_numeric($this->requestData[$key]) ? (float) $this->requestData[$key] : null;
    }

    protected function assertIntField(string $key, ?int $min = null, ?int $max = null): void
    {
        if (! $this->hasFilledValue($key)) {
            return;
        }

        $value = filter_var($this->requestData[$key], FILTER_VALIDATE_INT);
        if ($value === false) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => $key]);
        }

        $this->assertRange($key, (int) $value, $min, $max);
    }

    protected function assertFloatField(string $key, ?float $min = null, ?float $max = null): void
    {
        if (! $this->hasFilledValue($key)) {
            return;
        }

        if (! is_numeric($this->requestData[$key])) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => $key]);
        }

        $this->assertRange($key, (float) $this->requestData[$key], $min, $max);
    }

    protected function hasFilledValue(string $key): bool
    {
        return array_key_exists($key, $this->requestData)
            && $this->requestData[$key] !== null
            && $this->requestData[$key] !== '';
    }

    protected function nullableGenerateConfigInt(string $key): ?int
    {
        if (! $this->hasGenerateConfigValue($key)) {
            return null;
        }

        $value = filter_var($this->generateConfig[$key], FILTER_VALIDATE_INT);
        return $value === false ? null : (int) $value;
    }

    protected function nullableGenerateConfigFloat(string $key): ?float
    {
        if (! $this->hasGenerateConfigValue($key)) {
            return null;
        }

        return is_numeric($this->generateConfig[$key]) ? (float) $this->generateConfig[$key] : null;
    }

    protected function nullableGenerateConfigOrFieldInt(string $key): ?int
    {
        if ($this->hasGenerateConfigValue($key)) {
            return $this->nullableGenerateConfigInt($key);
        }

        return $this->nullableInt($key);
    }

    protected function nullableGenerateConfigOrFieldFloat(string $key): ?float
    {
        if ($this->hasGenerateConfigValue($key)) {
            return $this->nullableGenerateConfigFloat($key);
        }

        return $this->nullableFloat($key);
    }

    protected function assertGenerateConfig(): void
    {
        if (array_key_exists('generate_config', $this->requestData) && ! is_array($this->requestData['generate_config'])) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => 'generate_config']);
        }
    }

    /**
     * @param list<string> $keys
     */
    protected function assertProviderOptionsInGenerateConfig(array $keys): void
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $this->requestData)) {
                ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => 'generate_config.' . $key]);
            }
        }
    }

    protected function assertGenerateConfigIntField(string $key, ?int $min = null, ?int $max = null): void
    {
        if (! $this->hasGenerateConfigValue($key)) {
            return;
        }

        $value = filter_var($this->generateConfig[$key], FILTER_VALIDATE_INT);
        if ($value === false) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => 'generate_config.' . $key]);
        }

        $this->assertRange('generate_config.' . $key, (int) $value, $min, $max);
    }

    protected function assertGenerateConfigFloatField(string $key, ?float $min = null, ?float $max = null): void
    {
        if (! $this->hasGenerateConfigValue($key)) {
            return;
        }

        if (! is_numeric($this->generateConfig[$key])) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => 'generate_config.' . $key]);
        }

        $this->assertRange('generate_config.' . $key, (float) $this->generateConfig[$key], $min, $max);
    }

    protected function assertGenerateConfigOrFieldIntField(string $key, ?int $min = null, ?int $max = null): void
    {
        if ($this->hasGenerateConfigValue($key)) {
            $this->assertGenerateConfigIntField($key, $min, $max);
            return;
        }

        $this->assertIntField($key, $min, $max);
    }

    protected function assertGenerateConfigOrFieldFloatField(string $key, ?float $min = null, ?float $max = null): void
    {
        if ($this->hasGenerateConfigValue($key)) {
            $this->assertGenerateConfigFloatField($key, $min, $max);
            return;
        }

        $this->assertFloatField($key, $min, $max);
    }

    protected function assertImageInputField(string $key, string $value): void
    {
        if (! ImageInput::isSupported($value)) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_format', ['label' => $key]);
        }
    }

    protected function hasGenerateConfigValue(string $key): bool
    {
        return array_key_exists($key, $this->generateConfig)
            && $this->generateConfig[$key] !== null
            && $this->generateConfig[$key] !== '';
    }

    private function assertRange(string $key, float|int $value, null|float|int $min, null|float|int $max): void
    {
        if (($min !== null && $value < $min) || ($max !== null && $value > $max)) {
            ExceptionBuilder::throw(MagicApiErrorCode::ValidateFailed, 'common.invalid_range', [
                'label' => $key,
                'min' => $min ?? PHP_INT_MIN,
                'max' => $max ?? PHP_INT_MAX,
            ]);
        }
    }
}
