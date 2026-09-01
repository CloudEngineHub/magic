<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\Capability;

use App\Domain\ModelGateway\Entity\ValueObject\VideoGenerationConfig;
use App\Domain\ModelGateway\Entity\ValueObject\VideoInputMode;
use App\Domain\ModelGateway\Entity\ValueObject\VideoInputModeDefinition;
use Hyperf\Contract\TranslatorInterface;
use InvalidArgumentException;

readonly class GeminiOmniGenerationCapabilityProvider
{
    private const string MODEL = 'gemini-omni-1.1-flash';

    public function supportsModel(string $modelVersion, string $modelId): bool
    {
        $version = $this->normalize($modelVersion);
        $id = $this->normalize($modelId);
        if ($version !== '' && $this->isNumericProviderModelId($id)) {
            $id = '';
        }
        if ($version !== '' && $version !== self::MODEL || $id !== '' && $id !== self::MODEL) {
            return false;
        }
        return $version === self::MODEL || $id === self::MODEL;
    }

    public function resolveGenerationConfig(string $modelVersion, string $modelId): ?VideoGenerationConfig
    {
        if (! $this->supportsModel($modelVersion, $modelId)) {
            return null;
        }
        $translate = fn (string $key): string => di(TranslatorInterface::class)->trans('video.input_modes.' . $key);
        return new VideoGenerationConfig([
            'supported_inputs' => ['text_prompt', 'image', 'last_frame', 'reference_images', 'reference_videos'],
            'generation' => [
                'duration_type' => 'fixed', 'durations' => [8], 'default_duration_seconds' => 8,
                'resolutions' => ['720p', '1080p'], 'default_resolution' => '720p',
                'aspect_ratios' => ['16:9', '9:16'], 'supports_background' => true, 'supports_generate_audio' => false,
            ],
            'input_modes' => [
                VideoInputMode::Standard->value => VideoInputModeDefinition::standard($translate('standard'))->toArray(),
                VideoInputMode::ImageReference->value => VideoInputModeDefinition::imageReference($translate('image_reference.single'), 1, ['asset'], false)->toArray(),
                VideoInputMode::KeyframeGuided->value => VideoInputModeDefinition::keyframeGuided($translate('keyframe_guided.start_end'), ['start', 'end'])->toArray(),
                VideoInputMode::VideoEdit->value => VideoInputModeDefinition::videoEdit($translate('video_edit.single'), ['reference_videos'], 1)->toArray(),
                VideoInputMode::OmniReference->value => VideoInputModeDefinition::omniReference($translate('omni_reference'), ['reference_images', 'reference_videos'], 8)->toArray(),
            ],
        ]);
    }

    public function resolveProviderModelName(string $modelVersion, string $modelId = ''): string
    {
        if (! $this->supportsModel($modelVersion, $modelId)) {
            throw new InvalidArgumentException('Unsupported or conflicting Gemini video model identifiers.');
        }
        return self::MODEL;
    }

    private function normalize(string $value): string
    {
        return strtolower(trim($value));
    }

    private function isNumericProviderModelId(string $value): bool
    {
        return $value !== '' && ctype_digit($value);
    }
}
