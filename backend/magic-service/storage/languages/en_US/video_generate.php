<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    'general_error' => 'Video generation failed. Please check your input and try again later.',
    'response_format_error' => 'The video service returned an invalid response. Please try again later.',
    'missing_video_data' => 'The video service returned no valid video. Please try again later.',
    'input_text_audit_failed' => 'The prompt did not pass content review. Please adjust it and try again.',
    'input_image_audit_failed' => 'The input image did not pass content review. Please replace it and try again.',
    'input_video_audit_failed' => 'The input video did not pass content review. Please replace it and try again.',
    'input_audio_audit_failed' => 'The input audio did not pass content review. Please replace it and try again.',
    'output_text_audit_failed' => 'The generated text did not pass content review. Please adjust the prompt and try again.',
    'output_video_audit_failed' => 'The generated video did not pass content review. Please adjust the prompt or assets and try again.',
    'output_audio_audit_failed' => 'The generated audio did not pass content review. Please adjust the prompt or assets and try again.',
    'invalid_prompt' => 'The prompt is invalid. Please adjust it and try again.',
    'invalid_parameter' => 'The request parameters are invalid. Please review them and try again.',
    'unsupported_video_format' => 'The video or asset format is not supported. Please use another format and try again.',
    'invalid_aspect_ratio' => 'The aspect ratio is not supported. Please choose another ratio and try again.',
    'polling_failed' => 'The video task could not be queried. Please try again later.',
    'task_timeout' => 'Video generation timed out. Please try again later.',
    'task_not_found' => 'The video task was not found or has expired. Please submit it again.',
    'video_download_failed' => 'The generated video could not be downloaded. Please try again later.',
    'authentication_failed' => 'Video service authentication failed. Please check the configuration and try again.',
    'rate_limited' => 'The video service is receiving too many requests. Please try again later.',
    'quota_exceeded' => 'The video service quota is insufficient. Please check the account quota and try again.',
];
