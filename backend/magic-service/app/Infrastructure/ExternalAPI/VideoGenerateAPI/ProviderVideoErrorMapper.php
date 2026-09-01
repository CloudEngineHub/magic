<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\VideoGenerateAPI;

use App\ErrorCode\VideoGenerateErrorCode;
use Hyperf\Contract\TranslatorInterface;
use Throwable;

use function Hyperf\Translation\trans;

final class ProviderVideoErrorMapper
{
    public static function resolve(null|int|string $providerCode, ?int $httpStatus = null): VideoGenerateErrorCode
    {
        $code = preg_replace('/[^a-z0-9]+/', '', strtolower(trim((string) $providerCode))) ?? '';
        if ($code === '') {
            return match ($httpStatus) {
                401, 403 => VideoGenerateErrorCode::AUTHENTICATION_FAILED,
                429 => VideoGenerateErrorCode::RATE_LIMITED,
                default => VideoGenerateErrorCode::GENERAL_ERROR,
            };
        }

        return match (true) {
            str_starts_with($code, 'inputtextsensitivecontentdetected') => VideoGenerateErrorCode::INPUT_TEXT_AUDIT_FAILED,
            str_starts_with($code, 'inputimagesensitivecontentdetected') => VideoGenerateErrorCode::INPUT_IMAGE_AUDIT_FAILED,
            str_starts_with($code, 'inputvideosensitivecontentdetected') => VideoGenerateErrorCode::INPUT_VIDEO_AUDIT_FAILED,
            str_starts_with($code, 'inputaudiosensitivecontentdetected') => VideoGenerateErrorCode::INPUT_AUDIO_AUDIT_FAILED,
            str_starts_with($code, 'outputtextsensitivecontentdetected') => VideoGenerateErrorCode::OUTPUT_TEXT_AUDIT_FAILED,
            str_starts_with($code, 'outputvideosensitivecontentdetected') => VideoGenerateErrorCode::OUTPUT_VIDEO_AUDIT_FAILED,
            str_starts_with($code, 'outputaudiosensitivecontentdetected') => VideoGenerateErrorCode::OUTPUT_AUDIO_AUDIT_FAILED,
            in_array($code, ['invalidprompt', 'promptcheckfailed', 'promptblocked'], true) => VideoGenerateErrorCode::INVALID_PROMPT,
            in_array($code, ['invalidaspectratio', 'invalidparameter.invalidaspectratio'], true) => VideoGenerateErrorCode::INVALID_ASPECT_RATIO,
            in_array($code, ['invalidfileformat', 'unsupportedvideoformat', 'unsupportedformat'], true) => VideoGenerateErrorCode::UNSUPPORTED_VIDEO_FORMAT,
            in_array($code, ['responseformaterror', 'invalidresponse'], true) => VideoGenerateErrorCode::RESPONSE_FORMAT_ERROR,
            in_array($code, ['missingvideodata', 'missingvideo', 'novideooutput'], true) => VideoGenerateErrorCode::MISSING_VIDEO_DATA,
            in_array($code, ['tasktimeout', 'timeout'], true) => VideoGenerateErrorCode::TASK_TIMEOUT,
            in_array($code, ['tasknotfound', 'notfound', 'resourcenotfound'], true) => VideoGenerateErrorCode::TASK_NOT_FOUND,
            in_array($code, ['videodownloadfailed', 'downloadfailed'], true) => VideoGenerateErrorCode::VIDEO_DOWNLOAD_FAILED,
            in_array($code, ['invalidargument'], true) => VideoGenerateErrorCode::INVALID_PARAMETER,
            in_array($code, ['unauthenticated', 'permissiondenied'], true) => VideoGenerateErrorCode::AUTHENTICATION_FAILED,
            in_array($code, ['resourceexhausted'], true) => VideoGenerateErrorCode::QUOTA_EXCEEDED,
            in_array($code, ['authenticationerror', 'unauthorized', 'accessdenied', 'invalidapikey'], true) => VideoGenerateErrorCode::AUTHENTICATION_FAILED,
            in_array($code, ['ratelimited', 'ratelimitexceeded', 'toomanyrequests', 'throttling', 'throttled'], true) => VideoGenerateErrorCode::RATE_LIMITED,
            in_array($code, ['quotaexceeded', 'insufficientquota', 'accountoverdueerror'], true) => VideoGenerateErrorCode::QUOTA_EXCEEDED,
            in_array($code, ['missingparameter', 'invalidparameter', 'invalidrequesterror', 'invalidargumenterror', 'invalidresolution', 'invalidvideoduration', 'filesizetoolarge', 'audiodurationtoolong'], true)
                || str_starts_with($code, 'invalidparameter'), => VideoGenerateErrorCode::INVALID_PARAMETER,
            $httpStatus === 401 || $httpStatus === 403 => VideoGenerateErrorCode::AUTHENTICATION_FAILED,
            $httpStatus === 429 => VideoGenerateErrorCode::RATE_LIMITED,
            $httpStatus === 400 => VideoGenerateErrorCode::GENERAL_ERROR,
            default => VideoGenerateErrorCode::GENERAL_ERROR,
        };
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
}
