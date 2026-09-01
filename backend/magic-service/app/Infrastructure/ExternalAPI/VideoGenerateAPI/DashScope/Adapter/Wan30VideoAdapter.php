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
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\Capability\Wan30GenerationCapabilityProvider;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\DashScope\DashScopeTransportInterface;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoErrorMapper;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ReferenceMediaPayload;
use InvalidArgumentException;

final class Wan30VideoAdapter implements VideoGenerationProviderAdapterInterface
{
    public function __construct(
        private Wan30GenerationCapabilityProvider $capabilityProvider,
        private DashScopeTransportInterface $transport,
    ) {
    }

    public function supportsModel(string $modelVersion, string $modelId): bool
    {
        return $this->capabilityProvider->supportsModel($modelVersion, $this->preferModelVersion($modelVersion, $modelId));
    }

    public function resolveGenerationConfig(string $modelVersion, string $modelId): ?VideoGenerationConfig
    {
        return $this->capabilityProvider->resolveGenerationConfig($modelVersion, $modelId);
    }

    public function resolveHasAudioOutput(string $modelVersion, string $modelId, array $request): bool
    {
        $models = $this->tryResolveModels($modelVersion, $modelId);
        if ($models === null) {
            return false;
        }

        [$resolvedVersion, $resolvedId] = $models;
        $capability = $this->capabilityProvider->resolveGenerationConfig($resolvedVersion, $resolvedId);
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
        $generation = is_array($request['generation'] ?? null) ? $request['generation'] : [];
        $inputs = is_array($request['inputs'] ?? null) ? $request['inputs'] : [];
        [$modelVersion, $modelId] = $this->resolveOperationModels($operation);
        $model = $this->capabilityProvider->resolveProviderModelName($modelVersion, $modelId);
        $capability = $this->capabilityProvider->resolveGenerationConfig($modelVersion, $modelId);
        if ($capability === null) {
            throw new InvalidArgumentException('Wan 3.x capability is unavailable.');
        }
        $capabilityData = $capability->toArray();
        $inputMode = $this->normalizeInputMode($request['input_mode'] ?? null);
        $generationConfig = is_array($capabilityData['generation'] ?? null) ? $capabilityData['generation'] : [];
        $inputModes = is_array($capabilityData['input_modes'] ?? null) ? $capabilityData['input_modes'] : [];
        $inputModeConfig = is_array($inputModes[$inputMode] ?? null) ? $inputModes[$inputMode] : [];
        $constraints = is_array($capabilityData['constraints'] ?? null) ? $capabilityData['constraints'] : [];
        $this->validateGeneration($generation, $generationConfig);

        $input = ['prompt' => (string) ($request['prompt'] ?? '')];
        $acceptedParams = ['prompt', 'input_mode', 'generation.duration_seconds'];
        $ignoredParams = [];
        $media = match ($inputMode) {
            VideoInputMode::Standard->value => $this->buildStandardMedia($inputs),
            VideoInputMode::ImageReference->value => $this->buildImageReferenceMedia($inputs, $acceptedParams, $inputModeConfig),
            VideoInputMode::KeyframeGuided->value => $this->buildKeyframeMedia($inputs, $acceptedParams, $inputModeConfig),
            VideoInputMode::OmniReference->value => $this->buildOmniMedia($inputs, $acceptedParams, $inputModeConfig, $constraints),
            VideoInputMode::VideoEdit->value => $this->buildVideoEditMedia($inputs, $acceptedParams, $inputModeConfig),
            default => throw new InvalidArgumentException('Unsupported Wan 3.x input mode.'),
        };
        if ($media !== []) {
            $input['media'] = $media;
        }

        $parameters = [
            'resolution' => strtoupper($this->normalizeResolution($generation['resolution'] ?? ($generationConfig['default_resolution'] ?? '720p'))),
            'duration' => (int) ($generation['duration_seconds'] ?? ($generationConfig['default_duration_seconds'] ?? 5)),
        ];
        foreach ([
            'aspect_ratio' => 'ratio',
            'enhance_prompt' => 'prompt_extend',
            'generate_audio' => 'audio',
            'seed' => 'seed',
            'watermark' => 'watermark',
        ] as $requestField => $providerField) {
            if (! array_key_exists($requestField, $generation)) {
                continue;
            }

            $supportsField = match ($requestField) {
                'generate_audio' => (bool) ($generationConfig['supports_generate_audio'] ?? false),
                'enhance_prompt' => (bool) ($generationConfig['supports_enhance_prompt'] ?? false),
                'seed' => (bool) ($generationConfig['supports_seed'] ?? false),
                'watermark' => (bool) ($generationConfig['supports_watermark'] ?? false),
                default => true,
            };
            if (! $supportsField) {
                $ignoredParams[] = 'generation.' . $requestField;
                continue;
            }

            $parameters[$providerField] = match ($requestField) {
                'enhance_prompt', 'generate_audio', 'watermark' => (bool) $generation[$requestField],
                'seed' => (int) $generation[$requestField],
                default => (string) $generation[$requestField],
            };
            $acceptedParams[] = 'generation.' . $requestField;
        }
        $acceptedParams[] = 'generation.resolution';
        foreach (array_keys($generation) as $field) {
            if (! in_array($field, ['resolution', 'duration_seconds', 'aspect_ratio', 'enhance_prompt', 'generate_audio', 'seed', 'watermark'], true)
                || in_array('generation.' . $field, $ignoredParams, true)) {
                $ignoredParams[] = 'generation.' . $field;
            }
        }
        foreach (['frames', 'reference_images', 'reference_videos', 'reference_audios'] as $field) {
            if ($this->hasItems($inputs, $field) && ! in_array('inputs.' . $field, $acceptedParams, true)) {
                $ignoredParams[] = 'inputs.' . $field;
            }
        }
        if (array_key_exists('task', $request)) {
            $ignoredParams[] = 'task';
        }
        foreach (array_keys($request) as $field) {
            if (! in_array($field, ['prompt', 'input_mode', 'inputs', 'generation', 'task'], true)) {
                $ignoredParams[] = $field;
            }
        }
        foreach (array_keys($inputs) as $field) {
            if (! in_array($field, ['frames', 'reference_images', 'reference_videos', 'reference_audios'], true)) {
                $ignoredParams[] = 'inputs.' . $field;
            }
        }

        $operation->setAcceptedParams(array_values(array_unique($acceptedParams)));
        $operation->setIgnoredParams(array_values(array_unique($ignoredParams)));
        return ['model' => $model, 'input' => $input, 'parameters' => $parameters];
    }

    public function submit(VideoQueueOperationEntity $operation, QueueExecutorConfig $config): string
    {
        $response = $this->transport->submitVideo($config, $operation->getProviderPayload(), $this->logContext($operation));
        $taskId = $this->firstString($response['output']['task_id'] ?? null, $response['task_id'] ?? null);
        if ($taskId === null) {
            throw ProviderVideoException::nonRetriable('dashscope submit succeeded but task id missing');
        }
        return $taskId;
    }

    public function query(VideoQueueOperationEntity $operation, QueueExecutorConfig $config, string $providerTaskId): array
    {
        $detail = $this->transport->queryTask($config, $providerTaskId, $this->logContext($operation, $providerTaskId));
        $output = is_array($detail['output'] ?? null) ? $detail['output'] : [];
        $providerStatus = strtoupper(trim((string) ($output['task_status'] ?? 'PENDING')));
        $status = match ($providerStatus) {
            'SUCCEEDED' => 'succeeded',
            'FAILED', 'CANCELED', 'UNKNOWN' => 'failed',
            default => 'processing',
        };
        $videoUrl = $this->firstString($output['video_url'] ?? null);
        $providerCode = $this->firstString(
            $output['code'] ?? null,
            $detail['code'] ?? null,
            is_array($output['error'] ?? null) ? ($output['error']['code'] ?? null) : null,
            is_array($detail['error'] ?? null) ? ($detail['error']['code'] ?? null) : null,
        );
        if ($status === 'succeeded' && $videoUrl === null) {
            return $this->failedQueryResult($detail, VideoGenerateErrorCode::MISSING_VIDEO_DATA, $providerTaskId);
        }
        $errorCode = ProviderVideoErrorMapper::resolve($providerCode);
        return [
            'status' => $status,
            'provider_result' => $detail,
            'output' => $videoUrl === null ? [] : [
                'video_url' => $videoUrl,
                'provider_task_id' => $providerTaskId,
                'provider_base_url' => rtrim($config->getBaseUrl(), '/'),
            ],
            'error' => $status !== 'failed' ? null : [
                'code' => (string) $errorCode->value,
                'message' => ProviderVideoErrorMapper::message($errorCode, null, $providerCode),
                'provider_code' => $providerCode,
                'provider_message' => $this->firstString(
                    $output['task_status_msg'] ?? null,
                    $output['message'] ?? null,
                    is_array($output['error'] ?? null) ? ($output['error']['message'] ?? null) : null,
                    $detail['message'] ?? null,
                ),
            ],
        ];
    }

    private function failedQueryResult(array $detail, VideoGenerateErrorCode $errorCode, string $providerTaskId): array
    {
        return [
            'status' => 'failed',
            'provider_result' => $detail,
            'output' => [],
            'error' => [
                'code' => (string) $errorCode->value,
                'message' => ProviderVideoErrorMapper::message($errorCode),
                'provider_code' => null,
                'provider_task_id' => $providerTaskId,
            ],
        ];
    }

    private function resolveOperationModels(VideoQueueOperationEntity $operation): array
    {
        $version = trim($operation->getModelVersion()) !== '' ? $operation->getModelVersion() : $operation->getModel();
        $id = $operation->getProviderModelId();
        $models = $this->tryResolveModels($version, $id);
        if ($models === null) {
            throw new InvalidArgumentException('Unsupported or conflicting Wan 3.x model identifiers.');
        }
        return $models;
    }

    /** @return null|array{0: string, 1: string} */
    private function tryResolveModels(string $version, string $id): ?array
    {
        $id = $this->preferModelVersion($version, $id);
        if ($this->supportsModel($version, $id)) {
            return [$version, $id];
        }
        if ($this->supportsModel($version, '')) {
            return $this->supportsModel('', $id) ? null : [$version, ''];
        }
        return null;
    }

    private function preferModelVersion(string $modelVersion, string $modelId): string
    {
        $modelVersion = trim($modelVersion);
        $modelId = trim($modelId);
        return $modelVersion !== '' && ctype_digit($modelId) ? '' : $modelId;
    }

    private function validateGeneration(array $generation, array $capability): void
    {
        $resolutions = is_array($capability['resolutions'] ?? null) ? $capability['resolutions'] : [];
        $resolution = strtolower(trim((string) ($generation['resolution'] ?? ($capability['default_resolution'] ?? '720p'))));
        if (! in_array($resolution, $resolutions, true)) {
            throw new InvalidArgumentException('Wan 3.x resolution is invalid.');
        }
        $duration = (int) ($generation['duration_seconds'] ?? ($capability['default_duration_seconds'] ?? 5));
        $durations = $capability['durations'] ?? [];
        $validDuration = is_array($durations) && array_key_exists('min', $durations)
            ? $duration >= (int) $durations['min'] && $duration <= (int) $durations['max'] && (($duration - (int) $durations['min']) % max(1, (int) ($durations['step'] ?? 1)) === 0)
            : in_array($duration, is_array($durations) ? $durations : [], true);
        if (! $validDuration) {
            throw new InvalidArgumentException('Wan 3.x duration is invalid.');
        }
        if (array_key_exists('aspect_ratio', $generation) && ! in_array((string) $generation['aspect_ratio'], is_array($capability['aspect_ratios'] ?? null) ? $capability['aspect_ratios'] : [], true)) {
            throw new InvalidArgumentException('Wan 3.x aspect ratio is invalid.');
        }
    }

    private function buildStandardMedia(array $inputs): array
    {
        foreach (['frames', 'reference_images', 'reference_videos', 'reference_audios'] as $field) {
            if ($this->hasItems($inputs, $field)) {
                throw new InvalidArgumentException('Wan 3.x standard mode does not accept reference media.');
            }
        }
        return [];
    }

    private function buildImageReferenceMedia(array $inputs, array &$accepted, array $capability): array
    {
        $images = $this->mediaItems($inputs, 'reference_images');
        $maxCount = $this->requiredLimit($capability, ['reference_images', 'max_count']);
        if (count($images) !== 1 || count($images) > $maxCount || $this->hasItems($inputs, 'frames') || $this->hasItems($inputs, 'reference_videos') || $this->hasItems($inputs, 'reference_audios')) {
            throw new InvalidArgumentException('Wan 3.x image reference mode requires exactly one image.');
        }
        $accepted[] = 'inputs.reference_images';
        return [['type' => 'first_frame', 'url' => $images[0]['uri']]];
    }

    private function buildKeyframeMedia(array $inputs, array &$accepted, array $capability): array
    {
        if ($this->hasItems($inputs, 'reference_images') || $this->hasItems($inputs, 'reference_videos') || $this->hasItems($inputs, 'reference_audios')) {
            throw new InvalidArgumentException('Wan 3.x keyframe mode does not accept reference media.');
        }
        $frames = $this->mediaItems($inputs, 'frames');
        $roles = is_array($capability['frame_roles'] ?? null) ? array_values(array_filter($capability['frame_roles'], 'is_string')) : [];
        $aliases = is_array($capability['role_aliases'] ?? null) ? $capability['role_aliases'] : [];
        if ($roles === []) {
            throw new InvalidArgumentException('Wan 3.x keyframe capability roles are unavailable.');
        }
        $byRole = [];
        foreach ($frames as $frame) {
            $rawRole = strtolower(trim((string) ($frame['role'] ?? '')));
            $role = is_string($aliases[$rawRole] ?? null) ? strtolower(trim($aliases[$rawRole])) : $rawRole;
            if (! in_array($role, $roles, true)) {
                throw new InvalidArgumentException('Wan 3.x keyframe mode contains an unknown frame role.');
            }
            if (isset($byRole[$role])) {
                throw new InvalidArgumentException('Wan 3.x keyframe mode contains duplicate frame roles.');
            }
            $byRole[$role] = $frame['uri'];
        }
        foreach ($roles as $role) {
            $minimum = (int) ($capability['limits'][$role]['min'] ?? 0);
            if ($minimum > 0 && ! isset($byRole[$role])) {
                throw new InvalidArgumentException('Wan 3.x keyframe mode requires a ' . $role . ' frame.');
            }
        }
        $media = [];
        foreach ($roles as $role) {
            if (! isset($byRole[$role])) {
                continue;
            }
            $accepted[] = 'inputs.frames.' . $role;
            $media[] = ['type' => $role === 'start' ? 'first_frame' : 'last_frame', 'url' => $byRole[$role]];
        }
        return $media;
    }

    private function buildOmniMedia(array $inputs, array &$accepted, array $capability, array $constraints): array
    {
        if ($this->hasItems($inputs, 'frames')) {
            throw new InvalidArgumentException('Wan 3.x omni reference mode does not accept keyframes.');
        }
        $images = $this->mediaItems($inputs, 'reference_images');
        $videos = $this->mediaItems($inputs, 'reference_videos');
        $audios = $this->mediaItems($inputs, 'reference_audios');
        if ($images === [] && $videos === [] && $audios === []) {
            throw new InvalidArgumentException('Wan 3.x omni reference mode requires media.');
        }
        $variants = is_array($capability['variants'] ?? null) ? $capability['variants'] : [];
        $variantLimits = [];
        foreach ($variants as $variant) {
            if (is_array($variant) && is_string($variant['code'] ?? null)) {
                $variantLimits[$variant['code']] = is_array($variant['limits'] ?? null) ? $variant['limits'] : [];
            }
        }
        $maxCount = (int) ($capability['max_count'] ?? 0);
        if ($maxCount <= 0 || count($images) + count($videos) + count($audios) > $maxCount
            || count($images) > $this->requiredVariantLimit($variantLimits, 'reference_image', 'count')
            || count($videos) > $this->requiredVariantLimit($variantLimits, 'reference_video', 'count')
            || count($audios) > $this->requiredVariantLimit($variantLimits, 'reference_audio', 'count')) {
            throw new InvalidArgumentException('Wan 3.x omni reference media limit exceeded.');
        }
        $videoItemLimit = $this->requiredVariantLimit($variantLimits, 'reference_video', 'duration_seconds');
        foreach ($videos as $item) {
            if ((int) ($item['duration_seconds'] ?? 0) > $videoItemLimit) {
                throw new InvalidArgumentException('Wan 3.x reference media duration limit exceeded.');
            }
        }
        $audioItemLimit = $this->requiredVariantLimit($variantLimits, 'reference_audio', 'duration_seconds');
        foreach ($audios as $item) {
            if ((int) ($item['duration_seconds'] ?? 0) > $audioItemLimit) {
                throw new InvalidArgumentException('Wan 3.x reference media duration limit exceeded.');
            }
        }
        $videoDuration = array_sum(array_map(static fn (array $item): int => (int) ($item['duration_seconds'] ?? 0), $videos));
        $audioDuration = array_sum(array_map(static fn (array $item): int => (int) ($item['duration_seconds'] ?? 0), $audios));
        if ($videoDuration > $this->requiredVariantLimit($variantLimits, 'reference_video', 'total_duration_seconds')
            || $audioDuration > $this->requiredVariantLimit($variantLimits, 'reference_audio', 'total_duration_seconds')
            || $videoDuration + $audioDuration > $this->requiredLimit($constraints, ['reference_media', 'max_total_duration_seconds'])) {
            throw new InvalidArgumentException('Wan 3.x reference media total duration limit exceeded.');
        }
        $accepted = array_merge($accepted, ['inputs.reference_images', 'inputs.reference_videos', 'inputs.reference_audios']);
        return array_merge(
            $this->typedMedia($images, 'reference_image'),
            $this->typedMedia($videos, 'reference_video'),
            $this->typedMedia($audios, 'reference_audio'),
        );
    }

    private function buildVideoEditMedia(array $inputs, array &$accepted, array $capability): array
    {
        $videos = $this->mediaItems($inputs, 'reference_videos');
        $maxCount = (int) ($capability['max_count'] ?? 0);
        if ($maxCount <= 0 || count($videos) !== 1 || $this->hasItems($inputs, 'reference_images') || $this->hasItems($inputs, 'reference_audios') || $this->hasItems($inputs, 'frames')) {
            throw new InvalidArgumentException('Wan 3.x video edit mode requires exactly one reference video.');
        }
        $accepted[] = 'inputs.reference_videos';
        return [['type' => 'reference_video', 'url' => $videos[0]['uri']]];
    }

    private function typedMedia(array $items, string $type): array
    {
        return array_map(static fn (array $item): array => ['type' => $type, 'url' => $item['uri']], $items);
    }

    private function mediaItems(array $inputs, string $field): array
    {
        if (! array_key_exists($field, $inputs)) {
            return [];
        }
        $value = $inputs[$field];
        if (! is_array($value)) {
            throw new InvalidArgumentException('Wan 3.x media field must be an array.');
        }
        $items = [];
        $uris = [];
        foreach ($value as $item) {
            if (! is_array($item)) {
                throw new InvalidArgumentException('Wan 3.x media entry is invalid.');
            }
            $defaultMimeType = match ($field) {
                'reference_videos' => 'video/mp4',
                'reference_audios' => 'audio/mpeg',
                default => 'image/png',
            };
            $uri = ReferenceMediaPayload::normalize($item, 'Wan 3.x ' . $field . ' entry', $defaultMimeType);
            if (isset($uris[$uri])) {
                throw new InvalidArgumentException('Wan 3.x media entries must be unique.');
            }
            $uris[$uri] = true;
            $item['uri'] = $uri;
            $items[] = $item;
        }
        return $items;
    }

    private function hasItems(array $inputs, string $field): bool
    {
        return $this->mediaItems($inputs, $field) !== [];
    }

    private function requiredLimit(array $config, array $path): int
    {
        $value = $config;
        foreach ($path as $segment) {
            if (! is_array($value) || ! array_key_exists($segment, $value)) {
                throw new InvalidArgumentException('Wan 3.x capability media limit is unavailable.');
            }
            $value = $value[$segment];
        }
        $limit = (int) $value;
        if ($limit <= 0) {
            throw new InvalidArgumentException('Wan 3.x capability media limit is invalid.');
        }
        return $limit;
    }

    /** @param array<string, array<string, mixed>> $variants */
    private function requiredVariantLimit(array $variants, string $variant, string $limit): int
    {
        return $this->requiredLimit($variants, [$variant, $limit, 'max']);
    }

    private function normalizeInputMode(mixed $mode): string
    {
        $mode = is_string($mode) ? trim($mode) : '';
        if ($mode === '') {
            return VideoInputMode::Standard->value;
        }
        if (! VideoInputMode::isRequestValid($mode)) {
            throw new InvalidArgumentException('Wan 3.x input mode is invalid.');
        }
        return $mode;
    }

    private function normalizeResolution(mixed $value): string
    {
        return strtolower(trim((string) ($value ?? '720p')));
    }

    private function firstString(mixed ...$values): ?string
    {
        foreach ($values as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }
        return null;
    }

    private function logContext(VideoQueueOperationEntity $operation, ?string $providerTaskId = null): array
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
