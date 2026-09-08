<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Capability;

use App\Domain\ModelGateway\Entity\ValueObject\VideoGenerationConfig;
use App\Domain\ModelGateway\Entity\ValueObject\VideoInputMode;
use App\Domain\ModelGateway\Entity\ValueObject\VideoInputModeDefinition;
use Hyperf\Contract\TranslatorInterface;
use InvalidArgumentException;

readonly class Wan30GenerationCapabilityProvider
{
    private const string MODEL_NAME = 'wan3.0-video';

    private const string PRIME_MODEL_NAME = 'wan3.0-video-prime';

    /** @var list<string> */
    private const array SUPPORTED_MODEL_NAMES = [
        self::MODEL_NAME,
        self::PRIME_MODEL_NAME,
    ];

    /** @var list<string> */
    private const array SUPPORTED_ASPECT_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16'];

    /** @var list<string> */
    private const array SUPPORTED_RESOLUTIONS = ['480p', '720p', '1080p'];

    public function supportsModel(string $modelVersion, string $modelId): bool
    {
        return $this->resolveRequestedModel($modelVersion, $modelId) !== null;
    }

    public function resolveGenerationConfig(string $modelVersion, string $modelId): ?VideoGenerationConfig
    {
        if (! $this->supportsModel($modelVersion, $modelId)) {
            return null;
        }

        $keyframeGuided = VideoInputModeDefinition::keyframeGuided(
            description: $this->translateInputMode('keyframe_guided.start_end'),
            frameRoles: ['start', 'end'],
        )->toArray();
        $keyframeGuided['limits'] = [
            'start' => ['min' => 1, 'max' => 1],
            'end' => ['max' => 1],
        ];
        $keyframeGuided['role_aliases'] = ['first' => 'start', 'last' => 'end'];

        return new VideoGenerationConfig([
            'supported_inputs' => [
                'text_prompt',
                'image',
                'last_frame',
                'reference_images',
                'reference_videos',
                'reference_audios',
            ],
            'generation' => [
                'aspect_ratios' => self::SUPPORTED_ASPECT_RATIOS,
                'duration_type' => 'range',
                'durations' => ['min' => 2, 'max' => 30, 'step' => 1],
                'default_duration_seconds' => 5,
                'resolutions' => self::SUPPORTED_RESOLUTIONS,
                'default_resolution' => '720p',
                'supports_seed' => true,
                'supports_watermark' => true,
                'supports_generate_audio' => true,
                'supports_enhance_prompt' => true,
            ],
            'input_modes' => [
                VideoInputMode::Standard->value => VideoInputModeDefinition::standard(
                    $this->translateInputMode('standard'),
                )->toArray(),
                VideoInputMode::ImageReference->value => VideoInputModeDefinition::imageReference(
                    description: $this->translateInputMode('image_reference.single'),
                    maxCount: 1,
                    referenceTypes: ['asset'],
                    styleSupported: false,
                )->toArray(),
                VideoInputMode::KeyframeGuided->value => $keyframeGuided,
                VideoInputMode::OmniReference->value => VideoInputModeDefinition::omniReference(
                    description: $this->translateInputMode('omni_reference', ['max_count' => 20]),
                    supportedFields: ['reference_images', 'reference_videos', 'reference_audios'],
                    maxCount: 20,
                    variants: [
                        ['code' => 'reference_image', 'description' => $this->translateInputMode('reference_image'), 'limits' => ['count' => ['max' => 10]]],
                        ['code' => 'reference_video', 'description' => $this->translateInputMode('reference_video'), 'limits' => ['count' => ['max' => 5], 'duration_seconds' => ['max' => 15], 'total_duration_seconds' => ['max' => 15]]],
                        ['code' => 'reference_audio', 'description' => $this->translateInputMode('reference_audio'), 'limits' => ['count' => ['max' => 5], 'duration_seconds' => ['max' => 15], 'total_duration_seconds' => ['max' => 15]]],
                    ],
                )->toArray(),
                VideoInputMode::VideoEdit->value => VideoInputModeDefinition::videoEdit(
                    description: $this->translateInputMode('video_edit.single'),
                    supportedFields: ['reference_videos'],
                    maxCount: 1,
                )->toArray(),
            ],
            'constraints' => [
                'reference_media' => [
                    'max_count' => 20,
                    'max_total_duration_seconds' => 30,
                    'max_files' => 1,
                    'max_public_urls' => 1,
                    'file_and_public_url_mutually_exclusive' => true,
                ],
            ],
        ]);
    }

    public function resolveProviderModelName(string $modelVersion, string $modelId = ''): string
    {
        $model = $this->resolveRequestedModel($modelVersion, $modelId);
        if ($model === null) {
            throw new InvalidArgumentException('Unsupported or conflicting Wan 3.x model identifiers.');
        }

        return $model;
    }

    private function resolveRequestedModel(string $modelVersion, string $modelId): ?string
    {
        $version = $this->normalizeModel($modelVersion);
        $id = $this->normalizeModel($modelId);

        if ($version === '') {
            return $this->isSupportedModel($id) ? $id : null;
        }
        if ($id === '') {
            return $this->isSupportedModel($version) ? $version : null;
        }

        return $version === $id && $this->isSupportedModel($version) ? $version : null;
    }

    private function isSupportedModel(string $model): bool
    {
        return in_array($model, self::SUPPORTED_MODEL_NAMES, true);
    }

    private function normalizeModel(string $model): string
    {
        return strtolower(trim($model));
    }

    private function translateInputMode(string $key, array $replace = []): string
    {
        return di(TranslatorInterface::class)->trans('video.input_modes.' . $key, $replace);
    }
}
