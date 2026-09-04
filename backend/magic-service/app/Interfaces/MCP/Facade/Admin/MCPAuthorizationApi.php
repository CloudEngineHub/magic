<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MCP\Facade\Admin;

use App\Application\MCP\Authorization\MCPAuthorizationBindingService;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

/**
 * MCP 2026-07-28 Authorization 绑定接口。
 */
#[ApiResponse(version: 'low_code')]
class MCPAuthorizationApi extends AbstractMCPAdminApi
{
    #[Inject]
    protected MCPAuthorizationBindingService $bindingService;

    /**
     * 处理 MCP Authorization 回调并绑定凭据。
     */
    public function bind(): array
    {
        return $this->bindingService->bind(
            $this->getAuthorization(),
            (string) $this->request->input('code', ''),
            (string) $this->request->input('state', ''),
            $this->request->input('iss'),
            $this->request->input('error')
        );
    }

    /**
     * 解除 MCP Authorization 凭据绑定。
     */
    public function unbind(): array
    {
        return $this->bindingService->unbind(
            $this->getAuthorization(),
            (string) $this->request->input('mcp_server_code', ''),
            $this->request->input('issuer')
        );
    }
}
