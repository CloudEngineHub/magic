<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\ErrorCode\VideoGenerateErrorCode;
use GuzzleHttp\Exception\RequestException;
use Throwable;

final class ProviderVideoErrorMapper
{
    public static function resolveGemini(
        ?RequestException $exception = null,
        null|array|string $body = null,
    ): VideoGenerateErrorCode {
        $body = is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body;
        $body ??= $exception === null ? null : self::readResponseBody($exception);
        $payload = self::decodeResponseBody($body);
        $error = is_array($payload['error'] ?? null) ? $payload['error'] : [];
        $providerCode = $error['code'] ?? $payload['code'] ?? null;
        $providerMessage = $error['message'] ?? $payload['message'] ?? $body ?? $exception?->getMessage();
        $code = self::normalize((string) $providerCode);
        $text = self::normalize((string) $providerMessage);

        // 宽高比不匹配
        if ($code === 'invalidargument' && str_contains($text, 'aspectratio')) {
            return VideoGenerateErrorCode::INVALID_ASPECT_RATIO;
        }
        // 通用参数错误
        if ($code === 'invalidargument') {
            return VideoGenerateErrorCode::INVALID_PARAMETER;
        }
        // 输入文本审核失败
        if ($code === 'inputtextsensitivecontentdetected' || $code === 'contentblocked') {
            return VideoGenerateErrorCode::INPUT_TEXT_AUDIT_FAILED;
        }
        // Gemini 请求参数错误
        if ($code === 'invalidrequest') {
            return VideoGenerateErrorCode::INVALID_PARAMETER;
        }
        // 输出视频审核失败
        if (str_contains($code, 'videowasfilteredout') || str_contains($text, 'videowasfilteredout')) {
            return VideoGenerateErrorCode::OUTPUT_VIDEO_AUDIT_FAILED;
        }

        return VideoGenerateErrorCode::GENERAL_ERROR;
    }

    public static function resolveDashScope(
        ?RequestException $exception = null,
        null|array|string $body = null,
    ): VideoGenerateErrorCode {
        $body = is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body;
        $body ??= $exception === null ? null : self::readResponseBody($exception);
        $payload = self::decodeResponseBody($body);
        $error = is_array($payload['error'] ?? null) ? $payload['error'] : [];
        $output = is_array($payload['output'] ?? null) ? $payload['output'] : [];
        $outputError = is_array($output['error'] ?? null) ? $output['error'] : [];
        $providerCode = $payload['code'] ?? $error['code'] ?? $output['code'] ?? $outputError['code'] ?? null;
        $providerMessage = $payload['message'] ?? $error['message'] ?? $output['message'] ?? $outputError['message'] ?? $output['task_status_msg'] ?? $body ?? $exception?->getMessage();
        $code = self::normalize((string) $providerCode);
        $text = self::normalize((string) $providerMessage);

        // 宽高比不匹配
        if (str_starts_with($code, 'invalidparameterinvalidaspectratio') || $code === 'invalidaspectratio') {
            return VideoGenerateErrorCode::INVALID_ASPECT_RATIO;
        }
        // 输入视频审核失败
        if (str_starts_with($code, 'inputvideosensitivecontentdetected')) {
            return VideoGenerateErrorCode::INPUT_VIDEO_AUDIT_FAILED;
        }
        // 输入图片审核失败
        if (str_starts_with($code, 'inputimagesensitivecontentdetected')) {
            return VideoGenerateErrorCode::INPUT_IMAGE_AUDIT_FAILED;
        }
        // 输入文本审核失败
        if (str_starts_with($code, 'inputtextsensitivecontentdetected')) {
            return VideoGenerateErrorCode::INPUT_TEXT_AUDIT_FAILED;
        }
        // 输入音频审核失败
        if (str_starts_with($code, 'inputaudiosensitivecontentdetected')) {
            return VideoGenerateErrorCode::INPUT_AUDIO_AUDIT_FAILED;
        }
        if (str_starts_with($code, 'outputtextsensitivecontentdetected')) {
            return VideoGenerateErrorCode::OUTPUT_TEXT_AUDIT_FAILED;
        }
        // 输出视频审核失败
        if (str_starts_with($code, 'outputvideosensitivecontentdetected')) {
            return VideoGenerateErrorCode::OUTPUT_VIDEO_AUDIT_FAILED;
        }
        if (str_starts_with($code, 'outputaudiosensitivecontentdetected')) {
            return VideoGenerateErrorCode::OUTPUT_AUDIO_AUDIT_FAILED;
        }
        if (str_starts_with($code, 'invalidprompt') || str_starts_with($code, 'promptcheckfailed') || str_starts_with($code, 'promptblocked')) {
            return VideoGenerateErrorCode::INVALID_PROMPT;
        }
        // 分辨率或时长不支持
        if (str_starts_with($code, 'invalidparameterinvalidresolution') || str_starts_with($code, 'invalidparameterinvalidvideoduration')) {
            return VideoGenerateErrorCode::INVALID_PARAMETER;
        }
        // 素材格式不支持
        if (str_starts_with($code, 'invalidfileformat') || str_starts_with($code, 'unsupportedvideoformat') || $code === 'unsupportedformat') {
            return VideoGenerateErrorCode::UNSUPPORTED_VIDEO_FORMAT;
        }
        // 音频时长过长
        if ($code === 'audiodurationtoolong') {
            return VideoGenerateErrorCode::INVALID_PARAMETER;
        }
        // 任务不存在
        if (str_starts_with($code, 'tasknotfound') || str_starts_with($code, 'resourcenotfound')) {
            return VideoGenerateErrorCode::TASK_NOT_FOUND;
        }
        // 任务超时
        if ($code === 'tasktimeout' || $code === 'timeout') {
            return VideoGenerateErrorCode::TASK_TIMEOUT;
        }
        // 参数错误
        if (str_starts_with($code, 'invalidparameter') || str_contains($text, 'invalidparameter')) {
            return VideoGenerateErrorCode::INVALID_PARAMETER;
        }

        return VideoGenerateErrorCode::GENERAL_ERROR;
    }

    public static function isRetriable(
        ?RequestException $exception = null,
        ?VideoGenerateErrorCode $errorCode = null,
    ): bool {
        if ($errorCode !== null && in_array($errorCode, [
            VideoGenerateErrorCode::INPUT_TEXT_AUDIT_FAILED,
            VideoGenerateErrorCode::INPUT_IMAGE_AUDIT_FAILED,
            VideoGenerateErrorCode::INPUT_VIDEO_AUDIT_FAILED,
            VideoGenerateErrorCode::INPUT_AUDIO_AUDIT_FAILED,
            VideoGenerateErrorCode::OUTPUT_TEXT_AUDIT_FAILED,
            VideoGenerateErrorCode::OUTPUT_VIDEO_AUDIT_FAILED,
            VideoGenerateErrorCode::OUTPUT_AUDIO_AUDIT_FAILED,
            VideoGenerateErrorCode::INVALID_PROMPT,
            VideoGenerateErrorCode::INVALID_PARAMETER,
            VideoGenerateErrorCode::UNSUPPORTED_VIDEO_FORMAT,
            VideoGenerateErrorCode::INVALID_ASPECT_RATIO,
            VideoGenerateErrorCode::TASK_NOT_FOUND,
            VideoGenerateErrorCode::AUTHENTICATION_FAILED,
            VideoGenerateErrorCode::QUOTA_EXCEEDED,
        ], true)) {
            return false;
        }

        $status = $exception?->getResponse()?->getStatusCode();
        return $exception !== null && ($status === 429 || ($status !== null && $status >= 500) || ! $exception->hasResponse());
    }

    private static function readResponseBody(RequestException $exception): ?string
    {
        $body = $exception->getResponse()?->getBody();
        if ($body === null) {
            return null;
        }
        if ($body->isSeekable()) {
            $body->rewind();
        }
        $content = (string) $body;
        if ($body->isSeekable()) {
            $body->rewind();
        }

        return $content === '' ? null : $content;
    }

    /** @return array<string, mixed> */
    private static function decodeResponseBody(?string $body): array
    {
        if ($body === null || trim($body) === '') {
            return [];
        }

        try {
            $payload = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return [];
        }

        return is_array($payload) ? $payload : [];
    }

    private static function normalize(string $value): string
    {
        return preg_replace('/[^a-z0-9]+/', '', strtolower(trim($value))) ?? '';
    }
}
