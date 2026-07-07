<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Facade;

use App\Application\SlidesTemplate\Service\SlidesTemplateAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\GetSlidesTemplateFileUrlRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;

#[ApiResponse('low_code')]
class SlidesTemplateApi extends AbstractApi
{
    public function __construct(
        private readonly SlidesTemplateAppService $slidesTemplateAppService,
    ) {
    }

    public function queries(PublicQuerySlidesTemplateRequest $request): array
    {
        $request->validated();
        $result = $this->slidesTemplateAppService->queries($this->getAuthorization(), $request);

        return SlidesTemplateAssembler::createPageDTO(
            $result['list'],
            $result['page'],
            $result['total'],
            false,
            false
        )->toArray();
    }

    public function getFileUrl(GetSlidesTemplateFileUrlRequest $request, string $code): array
    {
        $request->validated();
        $template = $this->slidesTemplateAppService->getTemplateFileUrl(
            $this->getAuthorization(),
            $code,
            $request->getAccessContext()
        );

        return SlidesTemplateAssembler::createFileUrlDTO($template)->toArray();
    }
}
