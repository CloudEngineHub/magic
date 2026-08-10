<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\SuperAgent\Facade\OpenApi;

use Dtyq\ApiResponse\Annotation\ApiResponse;
use Dtyq\SuperMagic\Application\SuperAgent\Service\PublishedMicroAppResolver;
use Dtyq\SuperMagic\Interfaces\SuperAgent\Facade\AbstractApi;
use Hyperf\HttpServer\Contract\RequestInterface;

/**
 * Public micro app metadata API.
 */
#[ApiResponse('low_code')]
class OpenMicroAppApi extends AbstractApi
{
    public function __construct(
        protected RequestInterface $request,
        private readonly PublishedMicroAppResolver $publishedMicroAppResolver,
    ) {
        parent::__construct($request);
    }

    public function showTitle(int $appId): array
    {
        return ['project_name' => $this->publishedMicroAppResolver->getProjectName($appId)];
    }
}
