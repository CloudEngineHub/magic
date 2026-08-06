<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\File\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;
use Hyperf\Validation\Contract\ValidatorFactoryInterface;
use Hyperf\Validation\ValidationException;

use function di;

/**
 * Update Audio Project Metadata Request DTO.
 */
class UpdateAudioProjectMetadataRequestDTO extends AbstractRequestDTO
{
    public ?int $audioFileId = null;

    public ?int $duration = null;

    public ?string $location = null;

    /**
     * @var array<string, bool>
     */
    protected array $providedFields = [];

    public function getAudioFileId(): ?int
    {
        return $this->audioFileId;
    }

    public function setAudioFileId(null|int|string $value): void
    {
        $this->audioFileId = $value === null || $value === '' ? null : (int) $value;
    }

    public function getDuration(): ?int
    {
        return $this->duration;
    }

    public function setDuration(null|int|string $value): void
    {
        $this->duration = $value === null || $value === '' ? null : (int) $value;
    }

    public function getLocation(): ?string
    {
        return $this->location;
    }

    public function setLocation(?string $value): void
    {
        $this->location = $value;
    }

    public function hasAudioFileId(): bool
    {
        return $this->providedFields['audioFileId'] ?? false;
    }

    public function hasDuration(): bool
    {
        return $this->providedFields['duration'] ?? false;
    }

    public function hasLocation(): bool
    {
        return $this->providedFields['location'] ?? false;
    }

    public function hasMetadataField(): bool
    {
        return $this->hasAudioFileId() || $this->hasDuration() || $this->hasLocation();
    }

    /**
     * Return only fields that were provided in the request.
     */
    public function toResponseArray(): array
    {
        $response = [];
        if ($this->hasAudioFileId() && $this->getAudioFileId() !== null) {
            $response['audio_file_id'] = $this->getAudioFileId();
        }
        if ($this->hasDuration() && $this->getDuration() !== null) {
            $response['duration'] = $this->getDuration();
        }
        if ($this->hasLocation() && $this->getLocation() !== null) {
            $response['location'] = $this->getLocation();
        }

        return $response;
    }

    protected function initProperty(array $data): void
    {
        $this->providedFields = [];
        foreach ([
            'audio_file_id' => 'audioFileId',
            'audioFileId' => 'audioFileId',
            'duration' => 'duration',
            'location' => 'location',
        ] as $field => $property) {
            if (array_key_exists($field, $data)) {
                $this->providedFields[$property] = true;
            }
        }

        unset($data['provided_fields'], $data['providedFields']);
        parent::initProperty($data);
    }

    protected static function checkParams(array $params): array
    {
        if (array_key_exists('file_size', $params)) {
            $validator = di(ValidatorFactoryInterface::class)->make(
                $params,
                ['file_size' => 'required|numeric|min:1|max:0'],
                ['file_size.max' => 'File size is not supported by this endpoint']
            );

            throw new ValidationException($validator);
        }

        return parent::checkParams($params);
    }

    /**
     * Get validation rules.
     */
    protected static function getHyperfValidationRules(): array
    {
        return [
            'audio_file_id' => 'nullable|integer|min:1',
            'duration' => 'nullable|integer|min:0',
            'location' => 'nullable|string|max:500',
        ];
    }

    /**
     * Get custom error messages for validation failures.
     */
    protected static function getHyperfValidationMessage(): array
    {
        return [
            'audio_file_id.integer' => 'Audio file ID must be an integer',
            'audio_file_id.min' => 'Audio file ID must be greater than 0',
            'duration.integer' => 'Duration must be an integer',
            'duration.min' => 'Duration must be greater than or equal to 0',
            'location.string' => 'Location must be a string',
            'location.max' => 'Location cannot exceed 500 characters',
        ];
    }
}
