<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\ModelGateway\Facade\Open;

use App\Application\ModelGateway\Service\SlidesTemplateAppService;
use App\Domain\ModelGateway\Entity\Dto\SlidesTemplateFileUrlRequestDTO;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\GetSlidesTemplateFileUrlRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

#[ApiResponse(version: 'low_code')]
class SlidesTemplateApi extends AbstractOpenApi
{
    #[Inject]
    protected SlidesTemplateAppService $slidesTemplateAppService;

    public function getFileUrl(GetSlidesTemplateFileUrlRequest $request, string $code): array
    {
        $request->validated();
        $requestDTO = new SlidesTemplateFileUrlRequestDTO();
        $requestDTO->setAccessToken($this->getAccessToken());
        $requestDTO->setIps($this->getClientIps());
        $requestDTO->setBusinessParams($request->getAccessContext());
        $this->enrichRequestDTO($requestDTO, $this->request->getHeaders());

        $template = $this->slidesTemplateAppService->getTemplateFileUrl($requestDTO, $code);

        return SlidesTemplateAssembler::createFileUrlDTO($template)->toArray();
    }
}
