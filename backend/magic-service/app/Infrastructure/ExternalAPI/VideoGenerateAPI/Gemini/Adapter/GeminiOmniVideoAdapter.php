<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\Adapter;

use App\Domain\ModelGateway\Contract\VideoGenerationConnectivityTestableInterface;
use App\Domain\ModelGateway\Entity\ValueObject\QueueExecutorConfig;
use App\Domain\ModelGateway\Entity\ValueObject\VideoGenerationConfig;
use App\Domain\ModelGateway\Entity\VideoQueueOperationEntity;
use App\ErrorCode\VideoGenerateErrorCode;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\Capability\GeminiOmniGenerationCapabilityProvider;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\GeminiTransportInterface;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoErrorMapper;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ProviderVideoException;
use App\Infrastructure\ExternalAPI\VideoGenerateAPI\ReferenceMediaPayload;
use InvalidArgumentException;

final class GeminiOmniVideoAdapter implements VideoGenerationConnectivityTestableInterface
{
    private const string CONNECTIVITY_SUCCESS_MESSAGE = 'Video response format duration must be positive';

    private const array MEDIA_TYPES = [
        'frames' => 'image',
        'reference_images' => 'image',
        'reference_videos' => 'video',
    ];

    private const array INPUT_MODES = ['standard', 'image_reference', 'keyframe_guided', 'video_edit', 'omni_reference'];

    public function __construct(private GeminiOmniGenerationCapabilityProvider $capabilityProvider, private GeminiTransportInterface $transport)
    {
    }

    public function supportsModel(string $modelVersion, string $modelId): bool
    {
        return $this->capabilityProvider->supportsModel($modelVersion, $this->preferModelVersion($modelVersion, $modelId));
    }

    public function resolveGenerationConfig(string $modelVersion, string $modelId): ?VideoGenerationConfig
    {
        return $this->capabilityProvider->resolveGenerationConfig($modelVersion, $this->preferModelVersion($modelVersion, $modelId));
    }

    public function resolveHasAudioOutput(string $modelVersion, string $modelId, array $request): bool
    {
        return false;
    }

    /**
     * Builds a Gemini Interactions request from the shared video-generation request format.
     */
    public function buildProviderPayload(VideoQueueOperationEntity $operation): array
    {
        $modelVersion = trim($operation->getModelVersion()) !== '' ? $operation->getModelVersion() : $operation->getModel();
        $modelId = $this->preferModelVersion($modelVersion, $operation->getProviderModelId());
        $model = $this->capabilityProvider->resolveProviderModelName($modelVersion, $modelId);
        $request = $operation->getRawRequest();
        $inputs = $request['inputs'] ?? [];
        if (! is_array($inputs)) {
            throw new InvalidArgumentException('Gemini inputs must be an array.');
        }
        $generation = is_array($request['generation'] ?? null) ? $request['generation'] : [];
        $capability = $this->capabilityProvider->resolveGenerationConfig($modelVersion, $modelId);
        if ($capability === null) {
            throw new InvalidArgumentException('Gemini capability is unavailable.');
        }
        $generationConfig = $capability->toArray()['generation'];
        $mode = $this->normalizeInputMode($request['input_mode'] ?? null);
        $this->validateGeneration($generation, $generationConfig);
        $this->validateModeInputs($mode, $inputs);
        $normalizedInputs = $this->normalizeMediaInputs($inputs);
        $parts = $this->buildInputParts($normalizedInputs, $request['prompt'] ?? null);
        $responseFormat = $this->buildResponseFormat($generation, $generationConfig);
        $ignored = $this->ignoredParams($request, $generation);
        $operation->setAcceptedParams(['prompt', 'input_mode', 'inputs', 'generation.aspect_ratio', 'generation.resolution', 'generation.duration_seconds']);
        $operation->setIgnoredParams($ignored);
        return [
            'model' => $model,
            'input' => $parts,
            'background' => array_key_exists('background', $request) ? (bool) $request['background'] : true,
            'response_format' => $responseFormat,
        ];
    }

    public function submit(VideoQueueOperationEntity $operation, QueueExecutorConfig $config): string
    {
        $response = $this->transport->createInteraction($config, $operation->getProviderPayload(), ['operation_id' => $operation->getId()]);
        $id = isset($response['id']) && is_string($response['id']) ? trim($response['id']) : '';
        if ($id === '') {
            throw ProviderVideoException::nonRetriable('Gemini interaction id missing');
        }
        return $id;
    }

    public function testConnection(QueueExecutorConfig $config, string $modelVersion): bool
    {
        $payload = [
            'model' => $this->capabilityProvider->resolveProviderModelName($modelVersion),
            'input' => [['type' => 'text', 'text' => 'connectivity-test']],
            'background' => true,
            'response_format' => [
                'type' => 'video',
                'delivery' => 'uri',
                'aspect_ratio' => '16:9',
                'resolution' => '720p',
                'duration' => '0s',
            ],
        ];

        try {
            $this->transport->createInteraction($config, $payload, ['connectivity_test' => true]);
        } catch (ProviderVideoException $exception) {
            if (str_contains((string) $exception->getResponseContent(), self::CONNECTIVITY_SUCCESS_MESSAGE)) {
                return true;
            }

            throw ProviderVideoException::nonRetriable(
                $exception->getRequestException()?->getMessage() ?? $exception->getMessage(),
                $exception->getRequestException(),
                $exception->getHttpStatus(),
            );
        }

        throw ProviderVideoException::nonRetriable(
            'Gemini connectivity test did not receive the expected validation error',
        );
    }

    public function query(VideoQueueOperationEntity $operation, QueueExecutorConfig $config, string $providerTaskId): array
    {
        $detail = $this->transport->getInteraction($config, $providerTaskId, ['operation_id' => $operation->getId(), 'provider_task_id' => $providerTaskId]);
        $providerStatus = strtolower(trim((string) ($detail['status'] ?? 'queued')));
        $status = match ($providerStatus) {
            'completed', 'succeeded', 'success' => 'succeeded',
            'failed', 'cancelled', 'canceled', 'expired' => 'failed',
            default => 'processing',
        };
        $videoMedia = $this->findVideoMedia($detail);
        if ($status === 'succeeded' && $videoMedia === null) {
            return $this->failedResult($detail, $providerTaskId, VideoGenerateErrorCode::MISSING_VIDEO_DATA);
        }
        $videoUrl = $videoMedia['uri'] ?? null;
        if ($status === 'succeeded' && $videoMedia !== null && $videoMedia['kind'] === 'uri') {
            $downloaded = $this->transport->downloadMedia($config, $videoMedia['uri'], [
                'operation_id' => $operation->getId(),
                'provider_task_id' => $providerTaskId,
            ]);
            $videoMedia = [
                'kind' => 'bytes',
                'bytes_base64_encoded' => trim((string) ($downloaded['bytes_base64_encoded'] ?? '')),
                'mime_type' => trim((string) ($downloaded['mime_type'] ?? 'video/mp4')),
                'uri' => $videoUrl,
            ];
            if ($videoMedia['bytes_base64_encoded'] === '') {
                return $this->failedResult($detail, $providerTaskId, VideoGenerateErrorCode::MISSING_VIDEO_DATA);
            }
        }
        if ($videoMedia !== null && $videoMedia['kind'] === 'bytes') {
            $detail['response']['videos'] = [[
                'bytesBase64Encoded' => $videoMedia['bytes_base64_encoded'],
                'mimeType' => $videoMedia['mime_type'] !== '' ? $videoMedia['mime_type'] : 'video/mp4',
            ]];
        }
        $errorNode = is_array($detail['error'] ?? null) ? $detail['error'] : [];
        $providerCode = $errorNode['code'] ?? $detail['error_code'] ?? ($providerStatus === 'expired' ? 'TASK_TIMEOUT' : null);
        $errorCode = ProviderVideoErrorMapper::resolve(is_string($providerCode) || is_int($providerCode) ? $providerCode : null);
        $result = ['status' => $status, 'provider_result' => $detail, 'output' => $videoUrl === null ? [] : ['video_url' => $videoUrl, 'provider_task_id' => $providerTaskId, 'provider_base_url' => rtrim($config->getBaseUrl(), '/')], 'error' => null];
        if ($status === 'failed') {
            $result['error'] = ['code' => (string) $errorCode->value, 'message' => ProviderVideoErrorMapper::message($errorCode), 'provider_code' => $providerCode];
        }
        return $result;
    }

    private function normalizeInputMode(mixed $mode): string
    {
        $mode = strtolower(trim((string) ($mode ?? 'standard')));
        if (! in_array($mode, self::INPUT_MODES, true)) {
            throw new InvalidArgumentException('Gemini input mode is invalid.');
        }

        return $mode;
    }

    /** @param array<string, mixed> $generationConfig */
    private function validateGeneration(array $generation, array $generationConfig): void
    {
        $resolution = strtolower(trim((string) ($generation['resolution'] ?? $generationConfig['default_resolution'])));
        if (! in_array($resolution, $generationConfig['resolutions'], true)) {
            throw new InvalidArgumentException('Gemini resolution is invalid.');
        }

        $aspectRatio = trim((string) ($generation['aspect_ratio'] ?? '16:9'));
        if (! in_array($aspectRatio, $generationConfig['aspect_ratios'], true)) {
            throw new InvalidArgumentException('Gemini aspect ratio is invalid.');
        }

        $duration = (int) ($generation['duration_seconds'] ?? $generationConfig['default_duration_seconds']);
        if (! in_array($duration, array_map('intval', $generationConfig['durations']), true)) {
            throw new InvalidArgumentException('Gemini duration is invalid.');
        }
    }

    /** @param array<string, mixed> $inputs */
    private function validateModeInputs(string $mode, array $inputs): void
    {
        if ($mode === 'standard' && $inputs !== []) {
            throw new InvalidArgumentException('Gemini standard mode does not accept media.');
        }
        if ($mode === 'image_reference' && (($inputs['reference_images'] ?? []) === [] || ($inputs['frames'] ?? []) !== [] || ($inputs['reference_videos'] ?? []) !== [])) {
            throw new InvalidArgumentException('Gemini image reference mode requires reference images only.');
        }
        if ($mode === 'keyframe_guided' && (($inputs['frames'] ?? []) === [] || ($inputs['reference_images'] ?? []) !== [] || ($inputs['reference_videos'] ?? []) !== [])) {
            throw new InvalidArgumentException('Gemini keyframe mode requires frames only.');
        }
        if ($mode === 'video_edit' && (($inputs['reference_videos'] ?? []) === [] || ($inputs['frames'] ?? []) !== [] || ($inputs['reference_images'] ?? []) !== [])) {
            throw new InvalidArgumentException('Gemini video edit mode requires a reference video.');
        }
        // Omni mode accepts zero or more reference media items, so prompt-only requests stay valid.
    }

    /**
     * Normalizes supported media once; the provider request builder only consumes canonical URIs.
     *
     * @param array<string, mixed> $inputs
     * @return array<string, list<array<string, mixed>>>
     */
    private function normalizeMediaInputs(array $inputs): array
    {
        $normalized = [];
        foreach (self::MEDIA_TYPES as $field => $type) {
            if (! array_key_exists($field, $inputs)) {
                continue;
            }
            if (! is_array($inputs[$field])) {
                throw new InvalidArgumentException('Gemini media input must be an array.');
            }
            $normalized[$field] = array_map(
                fn (mixed $item): array => $this->normalizeMediaItem($field, $type, $item),
                $inputs[$field],
            );
        }

        return $normalized;
    }

    /** @return array<string, mixed> */
    private function normalizeMediaItem(string $field, string $type, mixed $item): array
    {
        if (! is_array($item)) {
            throw new InvalidArgumentException('Gemini media item is invalid.');
        }

        $normalized = [
            'uri' => ReferenceMediaPayload::normalize($item, 'Gemini ' . $field . ' entry', $type === 'video' ? 'video/mp4' : 'image/png'),
        ];
        if ($type === 'image' && isset($item['role'])) {
            $role = strtolower(trim((string) $item['role']));
            if ($field === 'frames' && ! in_array($role, ['start', 'end', 'first', 'last'], true)) {
                throw new InvalidArgumentException('Gemini frame role is invalid.');
            }
            $normalized['role'] = $role === 'first' ? 'start' : ($role === 'last' ? 'end' : $role);
        }

        return $normalized;
    }

    /** @param array<string, list<array<string, mixed>>> $inputs */
    private function buildInputParts(array $inputs, mixed $prompt): array
    {
        $parts = [];
        foreach (self::MEDIA_TYPES as $field => $type) {
            foreach ($inputs[$field] ?? [] as $item) {
                $part = ['type' => $type, 'uri' => $item['uri']];
                if (isset($item['role'])) {
                    $part['role'] = $item['role'];
                }
                $parts[] = $part;
            }
        }
        $prompt = trim((string) ($prompt ?? ''));
        if ($prompt !== '') {
            $parts[] = ['type' => 'text', 'text' => $prompt];
        }

        return $parts;
    }

    /** @param array<string, mixed> $generationConfig */
    private function buildResponseFormat(array $generation, array $generationConfig): array
    {
        $resolution = strtolower(trim((string) ($generation['resolution'] ?? $generationConfig['default_resolution'])));
        $aspectRatio = trim((string) ($generation['aspect_ratio'] ?? '16:9'));
        $duration = (int) ($generation['duration_seconds'] ?? $generationConfig['default_duration_seconds']);

        return [
            'type' => 'video',
            'delivery' => 'uri',
            'aspect_ratio' => $aspectRatio,
            'resolution' => $resolution,
            'duration' => $duration . 's',
        ];
    }

    /** @param array<string, mixed> $request @param array<string, mixed> $generation */
    private function ignoredParams(array $request, array $generation): array
    {
        $ignored = array_key_exists('generate_audio', $generation) ? ['generation.generate_audio'] : [];
        foreach (array_keys($request) as $field) {
            if (! in_array($field, ['prompt', 'input_mode', 'inputs', 'generation', 'background'], true)) {
                $ignored[] = $field;
            }
        }

        return $ignored;
    }

    private function failedResult(array $detail, string $taskId, VideoGenerateErrorCode $code): array
    {
        return ['status' => 'failed', 'provider_result' => $detail, 'output' => [], 'error' => ['code' => (string) $code->value, 'message' => ProviderVideoErrorMapper::message($code), 'provider_code' => null, 'provider_task_id' => $taskId]];
    }

    /** @return null|array{kind: 'bytes', bytes_base64_encoded: string, mime_type: string, uri?: string}|array{kind: 'uri', uri: string} */
    private function findVideoMedia(mixed $value, bool $videoContext = false): ?array
    {
        if (! is_array($value)) {
            return null;
        }
        $type = strtolower(trim((string) ($value['type'] ?? '')));
        $mimeType = trim((string) ($value['mimeType'] ?? $value['mime_type'] ?? ''));
        $videoContext = $videoContext
            || $type === 'video'
            || str_starts_with(strtolower($mimeType), 'video/');
        if ($videoContext && is_string($value['bytesBase64Encoded'] ?? null) && trim($value['bytesBase64Encoded']) !== '') {
            return [
                'kind' => 'bytes',
                'bytes_base64_encoded' => preg_replace('/\s+/', '', trim($value['bytesBase64Encoded'])) ?? '',
                'mime_type' => trim((string) ($value['mimeType'] ?? $value['mime_type'] ?? 'video/mp4')),
            ];
        }
        if ($videoContext) {
            foreach (['inlineData', 'inline_data'] as $inlineKey) {
                $inline = is_array($value[$inlineKey] ?? null) ? $value[$inlineKey] : null;
                if ($inline !== null && is_string($inline['data'] ?? null) && trim($inline['data']) !== '') {
                    return [
                        'kind' => 'bytes',
                        'bytes_base64_encoded' => preg_replace('/\s+/', '', trim($inline['data'])) ?? '',
                        'mime_type' => trim((string) ($inline['mimeType'] ?? $inline['mime_type'] ?? 'video/mp4')),
                    ];
                }
            }
            if (is_string($value['data'] ?? null) && trim($value['data']) !== '') {
                $data = trim($value['data']);
                if (preg_match('#^data:(?<mime>[-\w.+/]+);base64,(?<encoded>.+)$#is', $data, $matches) === 1) {
                    return ['kind' => 'bytes', 'bytes_base64_encoded' => preg_replace('/\s+/', '', $matches['encoded']) ?? '', 'mime_type' => strtolower(trim($matches['mime']))];
                }
                return ['kind' => 'bytes', 'bytes_base64_encoded' => preg_replace('/\s+/', '', $data) ?? '', 'mime_type' => trim((string) ($value['mimeType'] ?? $value['mime_type'] ?? 'video/mp4'))];
            }
            foreach (['uri', 'url', 'video_uri', 'video_url'] as $key) {
                if (is_string($value[$key] ?? null) && trim($value[$key]) !== '') {
                    return ['kind' => 'uri', 'uri' => trim($value[$key])];
                }
            }
        }
        foreach ($value as $key => $child) {
            $childVideoContext = $videoContext || in_array(strtolower((string) $key), ['videos', 'output_video'], true);
            $found = $this->findVideoMedia($child, $childVideoContext);
            if ($found !== null) {
                return $found;
            }
        }
        return null;
    }

    private function preferModelVersion(string $modelVersion, string $modelId): string
    {
        $modelVersion = trim($modelVersion);
        $modelId = trim($modelId);
        return $modelVersion !== '' && ctype_digit($modelId) ? '' : $modelId;
    }
}
