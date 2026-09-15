<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Project\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

/**
 * Create micro app project request DTO.
 */
class CreateMicroAppProjectRequestDTO extends AbstractRequestDTO
{
    /**
     * Project name.
     */
    public string $projectName = '';

    /**
     * Workspace ID. If empty, the micro app workspace will be created or reused.
     */
    public string $workspaceId = '';

    /**
     * Dynamic parameters for the initial topic.
     */
    public array $dynamicParams = [];

    public function getProjectName(): string
    {
        return $this->projectName;
    }

    public function setProjectName(?string $projectName): void
    {
        $this->projectName = $projectName ?? '';
    }

    public function getWorkspaceId(): string
    {
        return $this->workspaceId;
    }

    public function setWorkspaceId(null|int|string $workspaceId): void
    {
        $this->workspaceId = (string) ($workspaceId ?? '');
    }

    public function getDynamicParams(): array
    {
        return $this->dynamicParams;
    }

    public function setDynamicParams(?array $dynamicParams): void
    {
        $this->dynamicParams = $dynamicParams ?? [];
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'project_name' => 'nullable|string|max:100',
            'workspace_id' => 'nullable|string|max:32',
            'dynamic_params' => 'nullable|array',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'project_name.max' => 'Project name cannot exceed 100 characters',
            'workspace_id.max' => 'Workspace ID cannot exceed 32 characters',
            'dynamic_params.array' => 'Dynamic parameters must be an array',
        ];
    }
}
