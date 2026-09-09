<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\ErrorCode;

use App\Infrastructure\Core\Exception\Annotation\ErrorMessage;
use Throwable;

use function Hyperf\Translation\trans;

/**
 * 50000 - 50099 视频生成业务错误码。
 */
enum VideoGenerateErrorCode: int
{
    #[ErrorMessage(message: 'video_generate.general_error')]
    case GENERAL_ERROR = 50000;

    #[ErrorMessage(message: 'video_generate.response_format_error')]
    case RESPONSE_FORMAT_ERROR = 50001;

    #[ErrorMessage(message: 'video_generate.missing_video_data')]
    case MISSING_VIDEO_DATA = 50002;

    #[ErrorMessage(message: 'video_generate.input_text_audit_failed')]
    case INPUT_TEXT_AUDIT_FAILED = 50003;

    #[ErrorMessage(message: 'video_generate.input_image_audit_failed')]
    case INPUT_IMAGE_AUDIT_FAILED = 50004;

    #[ErrorMessage(message: 'video_generate.input_video_audit_failed')]
    case INPUT_VIDEO_AUDIT_FAILED = 50005;

    #[ErrorMessage(message: 'video_generate.input_audio_audit_failed')]
    case INPUT_AUDIO_AUDIT_FAILED = 50006;

    #[ErrorMessage(message: 'video_generate.output_text_audit_failed')]
    case OUTPUT_TEXT_AUDIT_FAILED = 50007;

    #[ErrorMessage(message: 'video_generate.output_video_audit_failed')]
    case OUTPUT_VIDEO_AUDIT_FAILED = 50008;

    #[ErrorMessage(message: 'video_generate.output_audio_audit_failed')]
    case OUTPUT_AUDIO_AUDIT_FAILED = 50009;

    #[ErrorMessage(message: 'video_generate.invalid_prompt')]
    case INVALID_PROMPT = 50010;

    #[ErrorMessage(message: 'video_generate.invalid_parameter')]
    case INVALID_PARAMETER = 50011;

    #[ErrorMessage(message: 'video_generate.unsupported_video_format')]
    case UNSUPPORTED_VIDEO_FORMAT = 50012;

    #[ErrorMessage(message: 'video_generate.invalid_aspect_ratio')]
    case INVALID_ASPECT_RATIO = 50013;

    #[ErrorMessage(message: 'video_generate.polling_failed')]
    case POLLING_FAILED = 50014;

    #[ErrorMessage(message: 'video_generate.task_timeout')]
    case TASK_TIMEOUT = 50015;

    #[ErrorMessage(message: 'video_generate.task_not_found')]
    case TASK_NOT_FOUND = 50016;

    #[ErrorMessage(message: 'video_generate.video_download_failed')]
    case VIDEO_DOWNLOAD_FAILED = 50017;

    #[ErrorMessage(message: 'video_generate.authentication_failed')]
    case AUTHENTICATION_FAILED = 50018;

    #[ErrorMessage(message: 'video_generate.rate_limited')]
    case RATE_LIMITED = 50019;

    #[ErrorMessage(message: 'video_generate.quota_exceeded')]
    case QUOTA_EXCEEDED = 50020;

    public function getMessage(): string
    {
        $key = 'video_generate.' . strtolower($this->name);
        try {
            $message = trans($key);
        } catch (Throwable) {
            return $key;
        }
        if (is_array($message)) {
            return implode(' ', $message);
        }

        return is_string($message) && $message !== '' ? $message : $key;
    }
}
