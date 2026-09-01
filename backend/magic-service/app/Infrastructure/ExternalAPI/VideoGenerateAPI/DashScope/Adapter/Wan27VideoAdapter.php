<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Adapter;

use App\Domain\ModelGateway\Contract\VideoGenerationProviderAdapterInterface;
use App\Domain\ModelGateway\Entity\ValueObject\QueueExecutorConfig;
use App\Domain\ModelGateway\Entity\ValueObject\VideoGenerationConfig;
use App\Domain\ModelGateway\Entity\ValueObject\VideoInputMode;
use App\Domain\ModelGateway\Entity\VideoQueueOperationEntity;
use App\ErrorCode\VideoGenerateErrorCode;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Capability\Wan27GenerationCapabilityProvider;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\DashScopeTransportInterface;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoErrorMapper;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ReferenceMediaPayload;
use InvalidArgumentException;

class Wan27VideoAdapter implements VideoGenerationProviderAdapterInterface
{
    /**
     * @var array<string, array<string, string>>
     */
    private const array DEFAULT_R2V_SIZES = [
        '720p' => [
            '16:9' => '1280*720',
            '9:16' => '720*1280',
            '1:1' => '960*960',
        ],
        '1080p' => [
            '16:9' => '1920*1080',
            '9:16' => '1080*1920',
            '1:1' => '1440*1440',
        ],
    ];

    public function __construct(
        private Wan27GenerationCapabilityProvider $capabilityProvider,
        private DashScopeTransportInterface $transport,
    ) {
    }

    public function supportsModel(string $modelVersion, string $modelId): bool
    {
        return $this->capabilityProvider->supportsModel($modelVersion, $modelId);
    }

    public function resolveGenerationConfig(string $modelVersion, string $modelId): ?VideoGenerationConfig
    {
        return $this->capabilityProvider->resolveGenerationConfig($modelVersion, $modelId);
    }

    public function resolveHasAudioOutput(string $modelVersion, string $modelId, array $request): bool
    {
        $capability = $this->capabilityProvider->resolveGenerationConfig($modelVersion, $modelId);
        $capabilityData = $capability?->toArray() ?? [];
        $generationConfig = is_array($capabilityData['generation'] ?? null) ? $capabilityData['generation'] : [];
        if (! (bool) ($generationConfig['supports_generate_audio'] ?? false)) {
            return false;
        }

        $generation = is_array($request['generation'] ?? null) ? $request['generation'] : [];
        return (bool) ($generation['generate_audio'] ?? true);
    }

    public function buildProviderPayload(VideoQueueOperationEntity $operation): array
    {
        $request = $operation->getRawRequest();
        $inputMode = $this->resolveInputMode($request);
        $inputs = is_array($request['inputs'] ?? null) ? $request['inputs'] : [];
        $generation = is_array($request['generation'] ?? null) ? $request['generation'] : [];
        $capability = $this->capabilityProvider->resolveGenerationConfig($operation->getModelVersion(), $operation->getModel());
        if ($capability === null) {
            throw new InvalidArgumentException('Wan 2.7 capability is unavailable.');
        }
        $capabilityData = $capability->toArray();
        $generationConfig = is_array($capabilityData['generation'] ?? null) ? $capabilityData['generation'] : [];
        $this->validateGeneration($generation, $generationConfig);
        $model = $this->capabilityProvider->resolveProviderModelName($inputMode);

        $input = [
            'prompt' => (string) ($request['prompt'] ?? ''),
        ];
        $acceptedParams = ['prompt', 'input_mode'];
        $ignoredParams = [];
        $usedGenerationFields = ['duration_seconds'];

        $negativePrompt = $this->normalizeOptionalString($generation['negative_prompt'] ?? null);
        if ($negativePrompt !== null) {
            $input['negative_prompt'] = $negativePrompt;
            $acceptedParams[] = 'generation.negative_prompt';
            $usedGenerationFields[] = 'negative_prompt';
        }

        $duration = (int) ($generation['duration_seconds'] ?? 5);
        $acceptedParams[] = 'generation.duration_seconds';

        if ($model === 'wan2.7-r2v') {
            $input['reference_urls'] = $this->extractReferenceUrls($inputs, $acceptedParams);
            if ($input['reference_urls'] === []) {
                throw new InvalidArgumentException('Wan 2.7 R2V requires reference URLs.');
            }
            $parameters = [
                'size' => $this->resolveR2vSize($generation, $acceptedParams, $ignoredParams, $usedGenerationFields),
                'duration' => $duration,
            ];
        } else {
            $parameters = [
                'resolution' => $this->resolveDashScopeResolution($generation['resolution'] ?? null),
                'duration' => $duration,
            ];
            $acceptedParams[] = 'generation.resolution';
            $usedGenerationFields[] = 'resolution';
            $aspectRatio = $this->normalizeOptionalString($generation['aspect_ratio'] ?? null);
            if ($aspectRatio !== null) {
                $parameters['ratio'] = $aspectRatio;
                $acceptedParams[] = 'generation.aspect_ratio';
                $usedGenerationFields[] = 'aspect_ratio';
            }

            if ($model === 'wan2.7-i2v') {
                $input['media'] = $this->buildImageToVideoMedia($inputs, $acceptedParams);
            } else {
                $this->markUnusedInputsIgnored($inputs, $ignoredParams);
            }

            if (array_key_exists('size', $generation)) {
                $ignoredParams[] = 'generation.size';
            }
        }

        foreach (['seed', 'watermark'] as $field) {
            if (! array_key_exists($field, $generation)) {
                continue;
            }

            $parameters[$field] = $field === 'seed' ? (int) $generation[$field] : (bool) $generation[$field];
            $acceptedParams[] = 'generation.' . $field;
            $usedGenerationFields[] = $field;
        }
        if (array_key_exists('enhance_prompt', $generation)) {
            $parameters['prompt_extend'] = (bool) $generation['enhance_prompt'];
            $acceptedParams[] = 'generation.enhance_prompt';
            $usedGenerationFields[] = 'enhance_prompt';
        }

        if (array_key_exists('generate_audio', $generation) && ! (bool) ($generationConfig['supports_generate_audio'] ?? false)) {
            $ignoredParams[] = 'generation.generate_audio';
        } elseif (array_key_exists('generate_audio', $generation)) {
            $parameters['audio'] = (bool) $generation['generate_audio'];
            $acceptedParams[] = 'generation.generate_audio';
            $usedGenerationFields[] = 'generate_audio';
        }
        foreach (array_keys($generation) as $field) {
            if (in_array($field, $usedGenerationFields, true)) {
                continue;
            }

            $ignoredParams[] = 'generation.' . $field;
        }
        if (! empty($request['task'] ?? null)) {
            $ignoredParams[] = 'task';
        }

        $operation->setAcceptedParams(array_values(array_unique($acceptedParams)));
        $operation->setIgnoredParams(array_values(array_unique($ignoredParams)));

        return [
            'model' => $model,
            'input' => $input,
            'parameters' => $parameters,
        ];
    }

    public function submit(VideoQueueOperationEntity $operation, QueueExecutorConfig $config): string
    {
        $response = $this->transport->submitVideo(
            $config,
            $operation->getProviderPayload(),
            $this->buildLogContext($operation),
        );

        $taskId = $this->firstNonEmptyString(
            $response['output']['task_id'] ?? null,
            $response['task_id'] ?? null,
        );
        if ($taskId === null) {
            throw ProviderVideoException::nonRetriable('dashscope submit succeeded but task id missing');
        }

        return $taskId;
    }

    public function query(VideoQueueOperationEntity $operation, QueueExecutorConfig $config, string $providerTaskId): array
    {
        $detail = $this->transport->queryTask(
            $config,
            $providerTaskId,
            $this->buildLogContext($operation, $providerTaskId),
        );

        $output = is_array($detail['output'] ?? null) ? $detail['output'] : [];
        $providerStatus = strtoupper(trim((string) ($output['task_status'] ?? 'PENDING')));
        $videoUrl = $this->firstNonEmptyString($output['video_url'] ?? null);
        $status = match ($providerStatus) {
            'SUCCEEDED' => 'succeeded',
            'FAILED', 'CANCELED', 'UNKNOWN' => 'failed',
            default => 'processing',
        };

        if ($status === 'succeeded' && $videoUrl === null) {
            return [
                'status' => 'failed',
                'provider_result' => $detail,
                'output' => [],
                'error' => [
                    'code' => (string) VideoGenerateErrorCode::MISSING_VIDEO_DATA->value,
                    'message' => ProviderVideoErrorMapper::message(VideoGenerateErrorCode::MISSING_VIDEO_DATA),
                    'provider_code' => null,
                    'provider_task_id' => $providerTaskId,
                ],
            ];
        }

        $providerCode = $this->firstNonEmptyString(
            $output['code'] ?? null,
            $detail['code'] ?? null,
            is_array($output['error'] ?? null) ? ($output['error']['code'] ?? null) : null,
            is_array($detail['error'] ?? null) ? ($detail['error']['code'] ?? null) : null,
        );
        $providerMessage = $this->firstNonEmptyString(
            $output['task_status_msg'] ?? null,
            $output['message'] ?? null,
            is_array($output['error'] ?? null) ? ($output['error']['message'] ?? null) : null,
            $detail['message'] ?? null,
        );
        $errorCode = ProviderVideoErrorMapper::resolve($providerCode);

        return [
            'status' => $status,
            'provider_result' => $detail,
            'output' => $videoUrl === null ? [] : [
                'video_url' => $videoUrl,
                'provider_task_id' => $providerTaskId,
                'provider_base_url' => rtrim($config->getBaseUrl(), '/'),
            ],
            'error' => $status === 'failed' ? [
                'code' => (string) $errorCode->value,
                'message' => ProviderVideoErrorMapper::message($errorCode, null, $providerCode),
                'provider_code' => $providerCode,
                'provider_message' => $providerMessage,
            ] : null,
        ];
    }

    private function validateGeneration(array $generation, array $capability): void
    {
        $resolution = strtolower(trim((string) ($generation['resolution'] ?? ($capability['default_resolution'] ?? '720p'))));
        $resolutions = is_array($capability['resolutions'] ?? null) ? $capability['resolutions'] : [];
        if (! in_array($resolution, $resolutions, true)) {
            throw new InvalidArgumentException('Wan 2.7 resolution is invalid.');
        }

        $duration = (int) ($generation['duration_seconds'] ?? ($capability['default_duration_seconds'] ?? 5));
        $durations = is_array($capability['durations'] ?? null) ? $capability['durations'] : [];
        if (! in_array($duration, $durations, true)) {
            throw new InvalidArgumentException('Wan 2.7 duration is invalid.');
        }

        if (array_key_exists('aspect_ratio', $generation)) {
            $aspectRatio = strtolower(trim((string) $generation['aspect_ratio']));
            $aspectRatios = is_array($capability['aspect_ratios'] ?? null) ? $capability['aspect_ratios'] : [];
            if (! in_array($aspectRatio, $aspectRatios, true)) {
                throw new InvalidArgumentException('Wan 2.7 aspect ratio is invalid.');
            }
        }
    }

    private function resolveInputMode(array $request): string
    {
        $inputMode = $this->normalizeOptionalString($request['input_mode'] ?? null);
        if ($inputMode === null || ! VideoInputMode::isRequestValid($inputMode)) {
            return VideoInputMode::Standard->value;
        }

        return $inputMode;
    }

    private function resolveDashScopeResolution(mixed $resolution): string
    {
        return strtoupper($this->normalizeOptionalString($resolution) ?? '720p');
    }

    private function resolveR2vSize(array $generation, array &$acceptedParams, array &$ignoredParams, array &$usedGenerationFields): string
    {
        $width = is_numeric($generation['width'] ?? null) ? (int) $generation['width'] : 0;
        $height = is_numeric($generation['height'] ?? null) ? (int) $generation['height'] : 0;
        if ($width > 0 && $height > 0) {
            $acceptedParams[] = 'generation.width';
            $acceptedParams[] = 'generation.height';
            $usedGenerationFields[] = 'width';
            $usedGenerationFields[] = 'height';
            return $width . '*' . $height;
        }

        $size = $this->normalizeOptionalString($generation['size'] ?? null);
        if ($size !== null && preg_match('/^\d+\s*[x*]\s*\d+$/i', $size) === 1) {
            $acceptedParams[] = 'generation.size';
            $usedGenerationFields[] = 'size';
            return preg_replace('/\s*[x*]\s*/i', '*', $size) ?? $size;
        }
        if (array_key_exists('size', $generation)) {
            $ignoredParams[] = 'generation.size';
        }

        $resolution = strtolower($this->normalizeOptionalString($generation['resolution'] ?? null) ?? '720p');
        $aspectRatio = $this->normalizeOptionalString($generation['aspect_ratio'] ?? null) ?? '16:9';
        $acceptedParams[] = 'generation.resolution';
        $acceptedParams[] = 'generation.aspect_ratio';
        $usedGenerationFields[] = 'resolution';
        $usedGenerationFields[] = 'aspect_ratio';

        return self::DEFAULT_R2V_SIZES[$resolution][$aspectRatio]
            ?? self::DEFAULT_R2V_SIZES['720p']['16:9'];
    }

    private function buildImageToVideoMedia(array $inputs, array &$acceptedParams): array
    {
        $frames = is_array($inputs['frames'] ?? null) ? $inputs['frames'] : [];
        $referenceImages = is_array($inputs['reference_images'] ?? null) ? $inputs['reference_images'] : [];
        $referenceVideos = is_array($inputs['reference_videos'] ?? null) ? $inputs['reference_videos'] : [];
        $media = [];

        $firstFrame = $this->firstNonEmptyString(
            $this->extractFrameUri($frames, 'start'),
            $this->extractFirstUri($referenceImages, 'Wan 2.7 reference image', 'image/png'),
        );
        if ($firstFrame !== null) {
            $media[] = ['type' => 'first_frame', 'url' => $firstFrame];
            $acceptedParams[] = $this->extractFrameUri($frames, 'start') === $firstFrame
                ? 'inputs.frames.start'
                : 'inputs.reference_images';
        }

        $lastFrame = $this->extractFrameUri($frames, 'end');
        if ($lastFrame !== null) {
            $media[] = ['type' => 'last_frame', 'url' => $lastFrame];
            $acceptedParams[] = 'inputs.frames.end';
        }

        $firstClip = $this->extractFirstUri($referenceVideos, 'Wan 2.7 reference video', 'video/mp4');
        if ($firstClip !== null) {
            $media[] = ['type' => 'first_clip', 'url' => $firstClip];
            $acceptedParams[] = 'inputs.reference_videos';
        }

        return $media;
    }

    private function extractReferenceUrls(array $inputs, array &$acceptedParams): array
    {
        $urls = [];
        foreach (['reference_images', 'reference_videos'] as $field) {
            $references = is_array($inputs[$field] ?? null) ? $inputs[$field] : [];
            foreach ($references as $reference) {
                if (! is_array($reference)) {
                    continue;
                }

                $urls[] = ReferenceMediaPayload::normalize(
                    $reference,
                    'Wan 2.7 ' . $field . ' entry',
                    str_starts_with($field, 'reference_video') ? 'video/mp4' : 'image/png',
                );
            }
            if ($references !== []) {
                $acceptedParams[] = 'inputs.' . $field;
            }
        }

        return $urls;
    }

    private function markUnusedInputsIgnored(array $inputs, array &$ignoredParams): void
    {
        foreach (['frames', 'reference_images', 'reference_videos'] as $field) {
            if (! empty($inputs[$field] ?? null)) {
                $ignoredParams[] = 'inputs.' . $field;
            }
        }
    }

    private function extractFrameUri(array $frames, string $targetRole): ?string
    {
        foreach ($frames as $frame) {
            if (! is_array($frame)) {
                continue;
            }

            $role = strtolower(trim((string) ($frame['role'] ?? '')));
            if ($role === $targetRole) {
                return ReferenceMediaPayload::normalize($frame, 'Wan 2.7 frame', 'image/png');
            }
        }

        return null;
    }

    private function extractFirstUri(array $references, string $context = 'Wan 2.7 reference media', string $defaultMimeType = 'image/png'): ?string
    {
        foreach ($references as $reference) {
            if (! is_array($reference)) {
                continue;
            }

            return ReferenceMediaPayload::normalize($reference, $context, $defaultMimeType);
        }

        return null;
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        $normalized = is_string($value) ? trim($value) : '';
        return $normalized === '' ? null : $normalized;
    }

    private function firstNonEmptyString(mixed ...$values): ?string
    {
        foreach ($values as $value) {
            $normalized = $this->normalizeOptionalString($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }

    private function buildLogContext(VideoQueueOperationEntity $operation, ?string $providerTaskId = null): array
    {
        return array_filter([
            'video_id' => $operation->getVideoId(),
            'operation_id' => $operation->getId(),
            'provider_task_id' => $providerTaskId,
            'model' => $operation->getModelVersion(),
            'endpoint' => $operation->getEndpoint(),
        ], static fn (mixed $value): bool => $value !== null && $value !== '');
    }
}
