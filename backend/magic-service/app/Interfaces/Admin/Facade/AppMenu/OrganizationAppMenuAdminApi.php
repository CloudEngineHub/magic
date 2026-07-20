<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Admin\Facade\AppMenu;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\Admin\Request\AppMenu\AppMenuSaveRequest;
use App\Interfaces\Admin\Request\AppMenu\AppMenuStatusRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;

#[ApiResponse('low_code')]
class OrganizationAppMenuAdminApi extends AppMenuAdminApi
{
    #[CheckPermission(MagicResourceEnum::ADMIN_AI_APPLICATION_MENU, MagicOperationEnum::QUERY)]
    public function queries()
    {
        return $this->handleQueries();
    }

    #[CheckPermission(MagicResourceEnum::ADMIN_AI_APPLICATION_MENU, MagicOperationEnum::QUERY)]
    public function show(string $id)
    {
        return $this->handleShow($id);
    }

    #[CheckPermission(MagicResourceEnum::ADMIN_AI_APPLICATION_MENU, MagicOperationEnum::EDIT)]
    public function save(AppMenuSaveRequest $request)
    {
        return $this->handleSave($request);
    }

    #[CheckPermission(MagicResourceEnum::ADMIN_AI_APPLICATION_MENU, MagicOperationEnum::EDIT)]
    public function delete()
    {
        return $this->handleDelete();
    }

    #[CheckPermission(MagicResourceEnum::ADMIN_AI_APPLICATION_MENU, MagicOperationEnum::EDIT)]
    public function status(AppMenuStatusRequest $request)
    {
        return $this->handleStatus($request);
    }
}
