<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\ErrorCode\VideoGenerateErrorCode;
use GuzzleHttp\Exception\RequestException;
use Hyperf\Contract\TranslatorInterface;
use Throwable;

use function Hyperf\Translation\trans;

final class ProviderVideoErrorMapper
{
    public static function resolve(
        null|int|string $providerCode,
        ?int $httpStatus = null,
        ?string $providerMessage = null,
    ): VideoGenerateErrorCode
    {
        if ($httpStatus === 401 || $httpStatus === 403) {
            return VideoGenerateErrorCode::AUTHENTICATION_FAILED;
        }
        if ($httpStatus === 429) {
            return VideoGenerateErrorCode::RATE_LIMITED;
        }

        $code = self::normalize((string) $providerCode);
        $text = self::normalize((string) $providerCode . ' ' . (string) $providerMessage);
        $errorRules = [
            VideoGenerateErrorCode::OUTPUT_VIDEO_AUDIT_FAILED->value => [
                'codes' => ['outputvideosensitivecontentdetected'],
                'keywords' => ['video was filtered', 'generated video was filtered'],
            ],
            VideoGenerateErrorCode::INPUT_TEXT_AUDIT_FAILED->value => [
                'codes' => ['inputtextsensitivecontentdetected', 'contentblocked'],
                'keywords' => ['input blocked', 'prohibited content', 'real people', 'likeness', 'safety policy'],
            ],
            VideoGenerateErrorCode::INPUT_IMAGE_AUDIT_FAILED->value => [
                'codes' => ['inputimagesensitivecontentdetected'],
                'keywords' => [],
            ],
            VideoGenerateErrorCode::INPUT_VIDEO_AUDIT_FAILED->value => [
                'codes' => ['inputvideosensitivecontentdetected'],
                'keywords' => [],
            ],
            VideoGenerateErrorCode::INPUT_AUDIO_AUDIT_FAILED->value => [
                'codes' => ['inputaudiosensitivecontentdetected'],
                'keywords' => [],
            ],
            VideoGenerateErrorCode::OUTPUT_TEXT_AUDIT_FAILED->value => [
                'codes' => ['outputtextsensitivecontentdetected'],
                'keywords' => [],
            ],
            VideoGenerateErrorCode::OUTPUT_AUDIO_AUDIT_FAILED->value => [
                'codes' => ['outputaudiosensitivecontentdetected'],
                'keywords' => [],
            ],
            VideoGenerateErrorCode::INVALID_PROMPT->value => [
                'codes' => ['invalidprompt', 'promptcheckfailed', 'promptblocked'],
                'keywords' => ['invalid prompt', 'prompt blocked'],
            ],
            VideoGenerateErrorCode::INVALID_ASPECT_RATIO->value => [
                'codes' => ['invalidaspectratio'],
                'keywords' => ['aspect ratio', '宽高比'],
            ],
            VideoGenerateErrorCode::INVALID_PARAMETER->value => [
                'codes' => [
                    'invalidargument', 'invalidrequest', 'invalidparameter', 'invalidargumenterror',
                    'invalidresolution', 'invalidvideoduration', 'missingparameter', 'filesizetoolarge', 'audiodurationtoolong',
                ],
                'keywords' => ['invalid parameter', 'invalid argument', 'duration does not match', 'aspect ratio', 'unsupported resolution'],
            ],
            VideoGenerateErrorCode::UNSUPPORTED_VIDEO_FORMAT->value => [
                'codes' => ['invalidfileformat', 'unsupportedvideoformat', 'unsupportedformat'],
                'keywords' => ['unsupported video format', 'invalid file format'],
            ],
            VideoGenerateErrorCode::AUTHENTICATION_FAILED->value => [
                'codes' => ['unauthenticated', 'permissiondenied', 'authenticationerror', 'unauthorized', 'accessdenied', 'invalidapikey'],
                'keywords' => ['api key', 'authentication', 'permission denied', 'unauthorized'],
            ],
            VideoGenerateErrorCode::RATE_LIMITED->value => [
                'codes' => ['ratelimited', 'ratelimitexceeded', 'toomanyrequests', 'throttling', 'throttled'],
                'keywords' => ['rate limit', 'too many requests', 'throttled'],
            ],
            VideoGenerateErrorCode::QUOTA_EXCEEDED->value => [
                'codes' => ['resourceexhausted', 'quotaexceeded', 'insufficientquota', 'accountoverdueerror'],
                'keywords' => ['quota exceeded', 'insufficient quota'],
            ],
            VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR->value => [
                'codes' => ['responseformaterror', 'invalidresponse'],
                'keywords' => [],
            ],
            VideoGenerateErrorCode::MISSING_VIDEO_DATA->value => [
                'codes' => ['missingvideodata', 'missingvideo', 'novideooutput'],
                'keywords' => [],
            ],
            VideoGenerateErrorCode::TASK_TIMEOUT->value => [
                'codes' => ['tasktimeout', 'timeout'],
                'keywords' => ['timed out', 'timeout'],
            ],
            VideoGenerateErrorCode::TASK_NOT_FOUND->value => [
                'codes' => ['tasknotfound', 'notfound', 'resourcenotfound'],
                'keywords' => ['task not found', 'resource not found'],
            ],
            VideoGenerateErrorCode::VIDEO_DOWNLOAD_FAILED->value => [
                'codes' => ['videodownloadfailed', 'downloadfailed'],
                'keywords' => ['video download failed', 'download failed'],
            ],
        ];

        foreach ($errorRules as $errorCode => $rule) {
            foreach ($rule['codes'] as $candidate) {
                $normalizedCandidate = self::normalize($candidate);
                if ($normalizedCandidate !== '' && ($code === $normalizedCandidate || str_starts_with($code, $normalizedCandidate))) {
                    return VideoGenerateErrorCode::from($errorCode);
                }
            }
            foreach ($rule['keywords'] as $keyword) {
                $normalizedKeyword = self::normalize($keyword);
                if ($normalizedKeyword !== '' && str_contains($text, $normalizedKeyword)) {
                    return VideoGenerateErrorCode::from($errorCode);
                }
            }
        }

        return VideoGenerateErrorCode::GENERAL_ERROR;
    }

    public static function resolveGemini(
        ?RequestException $exception = null,
        string|array|null $body = null,
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

    public static function isRetriable(
        ?int $httpStatus,
        bool $networkError = false,
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

        return $networkError || $httpStatus === 429 || ($httpStatus !== null && $httpStatus >= 500);
    }

    public static function message(
        VideoGenerateErrorCode $errorCode,
        ?TranslatorInterface $translator = null,
        null|int|string $providerCode = null,
    ): string {
        $key = 'video_generate.' . strtolower($errorCode->name);
        $message = self::translate($translator, $key);
        if (is_string($message) && $message !== '' && $message !== $key) {
            return $message;
        }

        if ($providerCode !== null && trim((string) $providerCode) !== '') {
            $legacyKey = 'video.errors.' . trim((string) $providerCode);
            $message = self::translate($translator, $legacyKey);
            if (is_string($message) && $message !== '' && $message !== $legacyKey && ! str_contains($message, $legacyKey)) {
                return $message;
            }
        }

        $genericKey = 'video.errors.generic';
        $message = self::translate($translator, $genericKey);
        if (is_string($message) && $message !== '' && $message !== $genericKey) {
            return $message;
        }

        return '视频生成失败，请检查输入内容或稍后重试。';
    }

    private static function translate(?TranslatorInterface $translator, string $key): array|string
    {
        try {
            return $translator?->trans($key) ?? trans($key);
        } catch (Throwable) {
            return $key;
        }
    }

    private static function normalize(string $value): string
    {
        return preg_replace('/[^a-z0-9]+/', '', strtolower(trim($value))) ?? '';
    }
}
