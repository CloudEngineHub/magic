<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    'general_error' => '视频生成失败，请检查输入内容或稍后重试。',
    'response_format_error' => '视频服务返回数据异常，请稍后重试。',
    'missing_video_data' => '视频服务未返回有效视频，请稍后重试。',
    'input_text_audit_failed' => '输入提示词未通过内容审核，请调整后重试。',
    'input_image_audit_failed' => '输入图片未通过内容审核，请更换素材后重试。',
    'input_video_audit_failed' => '输入视频未通过内容审核，请更换素材后重试。',
    'input_audio_audit_failed' => '输入音频未通过内容审核，请更换素材后重试。',
    'output_text_audit_failed' => '生成文本未通过内容审核，请调整提示词后重试。',
    'output_video_audit_failed' => '生成视频未通过内容审核，请调整提示词或素材后重试。',
    'output_audio_audit_failed' => '生成音频未通过内容审核，请调整提示词或素材后重试。',
    'invalid_prompt' => '提示词不符合要求，请调整后重试。',
    'invalid_parameter' => '请求参数不合法，请检查后重试。',
    'unsupported_video_format' => '视频或素材格式不受支持，请更换格式后重试。',
    'invalid_aspect_ratio' => '视频比例不受支持，请更换比例后重试。',
    'polling_failed' => '查询视频任务失败，请稍后重试。',
    'task_timeout' => '视频生成超时，请稍后重试。',
    'task_not_found' => '视频任务不存在或已过期，请重新提交。',
    'video_download_failed' => '视频下载失败，请稍后重试。',
    'authentication_failed' => '视频服务鉴权失败，请检查配置后重试。',
    'rate_limited' => '视频服务当前请求较多，请稍后重试。',
    'quota_exceeded' => '视频服务额度不足，请检查账户额度后重试。',
];
