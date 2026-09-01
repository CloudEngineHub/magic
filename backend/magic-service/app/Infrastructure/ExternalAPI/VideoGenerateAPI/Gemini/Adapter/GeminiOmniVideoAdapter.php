<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI\Gemini\Adapter;

use App\Domain\ModelGateway\Contract\VideoGenerationProviderAdapterInterface;
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

final class GeminiOmniVideoAdapter implements VideoGenerationProviderAdapterInterface
{
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
        $generationConfig = $capability?->toArray()['generation'] ?? [];
        $resolution = strtolower(trim((string) ($generation['resolution'] ?? ($generationConfig['default_resolution'] ?? '720p'))));
        if (! in_array($resolution, $generationConfig['resolutions'] ?? [], true)) {
            throw new InvalidArgumentException('Gemini resolution is invalid.');
        }
        $aspectRatio = trim((string) ($generation['aspect_ratio'] ?? '16:9'));
        if (! in_array($aspectRatio, $generationConfig['aspect_ratios'] ?? [], true)) {
            throw new InvalidArgumentException('Gemini aspect ratio is invalid.');
        }
        $duration = (int) ($generation['duration_seconds'] ?? ($generationConfig['default_duration_seconds'] ?? 8));
        $durations = $generationConfig['durations'] ?? [];
        if (is_array($durations) && isset($durations['min'], $durations['max']) && ($duration < (int) $durations['min'] || $duration > (int) $durations['max'])) {
            throw new InvalidArgumentException('Gemini duration is invalid.');
        }
        if (is_array($durations) && array_is_list($durations) && ! in_array($duration, array_map('intval', $durations), true)) {
            throw new InvalidArgumentException('Gemini duration is invalid.');
        }
        $mode = strtolower(trim((string) ($request['input_mode'] ?? 'standard')));
        if (! in_array($mode, ['standard', 'image_reference', 'keyframe_guided', 'video_edit', 'omni_reference'], true)) {
            throw new InvalidArgumentException('Gemini input mode is invalid.');
        }
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
        if ($mode === 'omni_reference' && (($inputs['reference_images'] ?? []) === [] && ($inputs['reference_videos'] ?? []) === [])) {
            throw new InvalidArgumentException('Gemini omni reference mode requires reference media.');
        }
        $parts = [];
        foreach (['frames' => 'image', 'reference_images' => 'image', 'reference_videos' => 'video'] as $field => $type) {
            if (array_key_exists($field, $inputs) && ! is_array($inputs[$field])) {
                throw new InvalidArgumentException('Gemini media input must be an array.');
            }
            foreach ((array) ($inputs[$field] ?? []) as $item) {
                if (! is_array($item)) {
                    throw new InvalidArgumentException('Gemini media item is invalid.');
                }
                $part = ['type' => $type, 'uri' => ReferenceMediaPayload::normalize(
                    $item,
                    'Gemini ' . $field . ' entry',
                    $type === 'video' ? 'video/mp4' : 'image/png',
                )];
                if ($type === 'image' && isset($item['role'])) {
                    $role = strtolower(trim((string) $item['role']));
                    if ($field === 'frames' && ! in_array($role, ['start', 'end', 'first', 'last'], true)) {
                        throw new InvalidArgumentException('Gemini frame role is invalid.');
                    }
                    $part['role'] = $role === 'first' ? 'start' : ($role === 'last' ? 'end' : $role);
                }
                $parts[] = $part;
            }
        }
        $prompt = trim((string) ($request['prompt'] ?? ''));
        if ($prompt !== '') {
            $parts[] = ['type' => 'text', 'text' => $prompt];
        }
        $responseFormat = ['type' => 'video', 'delivery' => 'uri', 'aspect_ratio' => $aspectRatio, 'resolution' => $resolution, 'duration' => $duration . 's'];
        foreach (['aspect_ratio' => 'aspect_ratio', 'resolution' => 'resolution'] as $from => $to) {
            if (isset($generation[$from])) {
                $responseFormat[$to] = (string) $generation[$from];
            }
        }
        $ignored = [];
        if (array_key_exists('generate_audio', $generation)) {
            $ignored[] = 'generation.generate_audio';
        }
        foreach (array_keys($request) as $field) {
            if (! in_array($field, ['prompt', 'input_mode', 'inputs', 'generation', 'background'], true)) {
                $ignored[] = $field;
            }
        }
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
