<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\ErrorCode;

use App\Infrastructure\Core\Exception\Annotation\ErrorMessage;

/**
 * 幻灯片模板错误码范围：47000-47999.
 */
enum SlidesTemplateErrorCode: int
{
    #[ErrorMessage('slides_template.validate_failed')]
    case VALIDATE_FAILED = 47000;

    #[ErrorMessage('slides_template.only_official_organization_can_manage')]
    case ONLY_OFFICIAL_ORGANIZATION_CAN_MANAGE = 47001;

    #[ErrorMessage('slides_template.not_found')]
    case TEMPLATE_NOT_FOUND = 47002;

    #[ErrorMessage('slides_template.code_generate_failed')]
    case CODE_GENERATE_FAILED = 47003;

    #[ErrorMessage('slides_template.file_url_generate_failed')]
    case FILE_URL_GENERATE_FAILED = 47004;

    #[ErrorMessage('slides_template.code_already_exists')]
    case CODE_ALREADY_EXISTS = 47005;

    #[ErrorMessage('slides_template.category_not_found')]
    case CATEGORY_NOT_FOUND = 47006;

    #[ErrorMessage('slides_template.category_code_already_exists')]
    case CATEGORY_CODE_ALREADY_EXISTS = 47007;

    #[ErrorMessage('slides_template.tag_not_found')]
    case TAG_NOT_FOUND = 47008;

    #[ErrorMessage('slides_template.tag_code_already_exists')]
    case TAG_CODE_ALREADY_EXISTS = 47009;
}
