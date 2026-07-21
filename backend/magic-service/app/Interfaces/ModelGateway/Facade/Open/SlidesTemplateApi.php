<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\ModelGateway\Facade\Open;

use App\Application\ModelGateway\Service\SlidesTemplateAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\GetSlidesTemplateFileUrlRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

#[ApiResponse(version: 'low_code')]
class SlidesTemplateApi extends AbstractApi
{
    #[Inject]
    protected SlidesTemplateAppService $slidesTemplateAppService;

    public function getFileUrl(GetSlidesTemplateFileUrlRequest $request, string $code): array
    {
        $request->validated();
        $authorization = $this->getAuthorization();
        $template = $this->slidesTemplateAppService->getTemplateFileUrl(
            $authorization,
            $code,
        );

        return SlidesTemplateAssembler::createFileUrlDTO($template)->toArray();
    }
}
