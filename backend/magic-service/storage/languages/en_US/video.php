<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
return [
    'generation' => [
        'generate_audio' => [
            'name' => 'Generate audio',
            'description' => 'Whether to generate audio',
        ],
        'web_search' => [
            'name' => 'Web search',
            'description' => 'Whether to enable web search',
        ],
    ],
    'input_modes' => [
        'standard' => 'Standard text-to-video mode without any reference assets.',
        'omni_reference' => 'Upload 1 to :max_count reference images to generate a video, with up to 1 reference video. Example: combine the subject from @image 1 with the motion from @video 1 to create an atmospheric short film.',
        'wan30_omni_reference' => 'Supports up to 10 reference images, 5 reference videos, and 5 reference audios, with a maximum of 20 reference assets in total. Example: combine the subject from @image 1 with the motion from @video 1 to create an atmospheric short film.',
        'gemini_omni_reference' => 'Upload 1 to 8 reference images to generate a video; when also uploading 1 reference video, up to 6 reference images are supported. Example: combine the subject from @image 1 with the motion from @video 1 to create an atmospheric short film.',
        'minimax_h3_omni_reference' => 'Supports up to 9 reference images, 3 reference videos, and 3 reference audios. Reference audio must be used with a reference image or video.',
        'minimax_h3_omni_reference_mode' => [
            'reference_media' => 'Mix reference images, videos, and audios, with up to 9 images and up to 3 videos and audios each. Reference audio must be paired with an image or video.',
        ],
        'omni_reference_mode' => [
            'images_only' => 'Upload reference images only, with support for up to 7 images.',
            'image_and_video' => 'When uploading reference images together with 1 reference video, up to 6 reference images are supported.',
        ],
        'keyframe_guided' => [
            'start_end' => 'First and last frame mode: lock the starting scene with the first frame and the ending scene with the last frame, then let AI complete the motion story in between.',
            'start_only' => 'First frame only mode: lock the starting scene with the first frame, then let AI animate the scene into a coherent video story.',
        ],
        'image_reference' => [
            'single' => 'Single image reference mode: upload 1 reference image and a text prompt to generate a highly matched video. Example: reference @image 1 to generate a dynamic video.',
            'multiple' => 'Image reference mode: upload 1 to :max_count reference images and a text prompt so AI can blend style, subject, and scene details into a video that closely matches the source images. Example: reference the style of @image 1 and the scene of @image 2 to generate a smooth dynamic video.',
        ],
        'video_edit' => 'Upload 1 reference video and use text instructions to edit or transform the original video.',
        'video_edit_mode' => [
            'images_only' => 'Upload 1 reference video only for editing.',
            'image_and_video' => 'Upload 1 reference video and up to 6 reference images for editing.',
        ],
    ],
    'errors' => [
        'generic' => 'Video generation failed. Please check your input and try again later.',
        'user_concurrency_limit' => 'Your video generation concurrency limit has been reached (maximum :limit running task(s)). Please wait for an existing task to finish before submitting another one.',
        'organization_concurrency_limit' => 'This organization has reached its video generation concurrency limit (maximum :limit running task(s)). Please wait for an existing organization task to finish before submitting another one.',
        'model_resolution_not_supported' => 'The current model (:model) does not support :resolution. Please switch to :supported and try again.',

        // volcengine ark
        'SensitiveContentDetected' => 'The input or generated content may contain sensitive material. Please adjust the prompt or assets and try again.',
        'InputTextSensitiveContentDetected' => [
            'PolicyViolation' => 'The input prompt may involve copyright-related restrictions. Please remove celebrity, IP, or brand references and try again.',
        ],
        'InputImageSensitiveContentDetected' => [
            'PolicyViolation' => 'The input image may involve copyright-related restrictions. Please replace it with low-risk assets and try again.',
            'PrivacyInformation' => 'The input image may contain a real person or face. Please replace it with non-person content and try again.',
        ],
        'InputVideoSensitiveContentDetected' => [
            'PolicyViolation' => 'The input video may involve copyright-related restrictions. Please replace it with low-risk assets and try again.',
            'PrivacyInformation' => 'The input video may contain a real person or face. Please replace it with non-person content and try again.',
        ],
        'InputAudioSensitiveContentDetected' => [
            'PolicyViolation' => 'The input audio may involve copyright-related restrictions. Please replace it with royalty-free audio and try again.',
        ],
        'OutputTextSensitiveContentDetected' => 'The generated content may contain sensitive material. Please adjust the prompt and try again.',
        'OutputImageSensitiveContentDetected' => 'The generated image may contain sensitive or restricted content. Please adjust the prompt or reference assets and try again.',
        'OutputVideoSensitiveContentDetected' => [
            'PolicyViolation' => 'The request failed because the output video may be related to copyright restrictions. Please adjust your prompt, audio, or reference assets and try again.',
        ],
        'OutputAudioSensitiveContentDetected' => 'The generated audio may contain sensitive or restricted content. Please adjust the prompt or reference assets and try again.',
        'ContentSecurity' => [
            'CopyrightRisk' => 'The content may involve copyright risk. Please remove copyrighted audio or brand, celebrity, or IP references and try again.',
            'SensitiveContent' => 'The input may contain sensitive content. Please simplify the prompt and remove inappropriate or restricted content before trying again.',
            'TrademarkRisk' => 'The asset may contain a logo or trademark. Please crop, blur, or replace the marked asset and try again.',
            'ViolentContent' => 'The input may contain violent or inappropriate content. Please replace it with compliant material and try again.',
        ],
        'MissingParameter' => 'A required request parameter is missing. Please review the request and try again.',
        'InvalidParameter' => [
            'InvalidVideoDuration' => 'The requested video duration is not supported. Please switch to a supported duration and try again.',
            'InvalidResolution' => 'The requested resolution is not supported. Please use 480p or 720p and try again.',
            'EmptyInput' => 'No valid image, video, or audio input was found. Please confirm the asset upload succeeded and try again.',
        ],
        'InvalidRequestError' => 'The request format is invalid. Please review the request body and try again.',
        'InvalidArgumentError' => 'One or more request arguments are invalid. Please review the parameters and try again.',
        'InternalServiceError' => 'The service encountered an internal error. Please try again later.',
        'InvalidFileFormat' => 'The asset format is not supported. Please use JPG/PNG images, MP4 videos, or MP3/WAV audio files.',
        'FileSizeTooLarge' => 'The asset file is too large. Please compress the file and try again.',
        'AudioDurationTooLong' => 'The audio is longer than the target video duration. Please trim the audio and try again.',
    ],
];
