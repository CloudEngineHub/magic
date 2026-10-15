<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Admin\Facade;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Application\Kernel\Service\IdentityWatermarkAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\Admin\Request\IdentityWatermarkUpdateRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class OrganizationIdentityWatermarkApi extends AbstractApi
{
    public function __construct(
        RequestInterface $request,
        protected readonly IdentityWatermarkAppService $identityWatermarkAppService,
    ) {
        parent::__construct($request);
    }

    #[CheckPermission([MagicResourceEnum::ADMIN_SETTING_IDENTITY_WATERMARK], MagicOperationEnum::EDIT)]
    public function show(): array
    {
        $authorization = $this->getAuthorization();
        return $this->toResponse(
            $this->identityWatermarkAppService->getEffective($authorization->getOrganizationCode())
        );
    }

    #[CheckPermission([MagicResourceEnum::ADMIN_SETTING_IDENTITY_WATERMARK], MagicOperationEnum::EDIT)]
    public function update(IdentityWatermarkUpdateRequest $request): array
    {
        $authorization = $this->getAuthorization();
        $organizationCode = $authorization->getOrganizationCode();
        $this->identityWatermarkAppService->saveOrganization(
            $organizationCode,
            $request->validated(),
            $authorization->getId(),
        );

        return $this->toResponse($this->identityWatermarkAppService->getEffective($organizationCode));
    }

    /**
     * @param array{
     *     organization: array{configured: bool, watermark: array<string, mixed>},
     *     platform_watermark: array<string, mixed>,
     *     effective_watermark: array<string, mixed>
     * } $result
     * @return array<string, mixed>
     */
    private function toResponse(array $result): array
    {
        return [
            'configured' => $result['organization']['configured'],
            'watermark' => $result['organization']['watermark'],
            'platform_watermark' => $result['platform_watermark'],
            'effective_watermark' => $result['effective_watermark'],
        ];
    }
}
