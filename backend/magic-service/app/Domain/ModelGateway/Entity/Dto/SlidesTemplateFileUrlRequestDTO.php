<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Entity\Dto;

class SlidesTemplateFileUrlRequestDTO extends AbstractRequestDTO
{
    public function getType(): string
    {
        return 'slides_template_file_url';
    }
}
