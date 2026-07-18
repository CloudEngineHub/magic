<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\Workspace;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\Workspace\Request\ImportWorkspaceRequest;
use Dtyq\SuperMagic\Infrastructure\ExternalAPI\SandboxOS\Workspace\Response\ImportWorkspaceResponse;

/**
 * Workspace importer interface.
 * Defines workspace import functionality via sandbox proxy.
 */
interface WorkspaceImporterInterface
{
    /**
     * Import workspace from remote ZIP URL.
     *
     * The DataIsolation parameter carries per-call user identity (userId,
     * orgCode, authorization token). The implementation forwards it to
     * the sandbox gateway which in turn forwards the authorization
     * token to the in-pod agent via the User-Authorization HTTP header.
     *
     * @param DataIsolation $dataIsolation Per-call user identity
     * @param string $sandboxId Sandbox ID to route the request through
     * @param ImportWorkspaceRequest $request Import request containing URL and target directory
     * @return ImportWorkspaceResponse Response containing imported workspace metadata
     */
    public function import(DataIsolation $dataIsolation, string $sandboxId, ImportWorkspaceRequest $request): ImportWorkspaceResponse;
}
