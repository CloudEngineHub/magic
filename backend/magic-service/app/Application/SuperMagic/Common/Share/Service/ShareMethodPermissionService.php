<?php

declare(strict_types=1);

namespace App\Application\SuperMagic\Common\Share\Service;

use App\Application\Permission\Service\FunctionPermissionAppService;
use App\Domain\SuperMagic\Common\Share\Constant\ShareAccessType;
use App\ErrorCode\ShareErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

/** Centralizes authorization for configurable project and micro-app share methods. */
class ShareMethodPermissionService
{
    public function __construct(
        private readonly FunctionPermissionAppService $functionPermissionAppService,
    ) {
    }

    public function assertAllowed(
        MagicUserAuthorization $authorization,
        string $resourceKind,
        int $shareType,
    ): void {
        $shareAccessType = ShareAccessType::tryFrom($shareType);
        if ($shareAccessType === null) {
            return;
        }

        $prefix = $resourceKind === 'micro_app' ? 'micro_app' : 'project';
        $suffix = match ($shareAccessType) {
            ShareAccessType::TeamShare => 'team',
            ShareAccessType::Internet => 'public',
            ShareAccessType::PasswordProtected => 'password',
        };
        $functionCode = $prefix . '.share_' . $suffix;

        if ($this->functionPermissionAppService->checkPermission($authorization, $functionCode)) {
            return;
        }

        ExceptionBuilder::throw(
            ShareErrorCode::SHARE_METHOD_NOT_ALLOWED,
            'share.share_method_not_allowed',
            ['shareType' => (string) $shareType]
        );
    }
}
