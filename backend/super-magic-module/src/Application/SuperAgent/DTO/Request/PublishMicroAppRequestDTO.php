<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Application\SuperAgent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class PublishMicroAppRequestDTO extends AbstractRequestDTO
{
    public string $projectName = '';

    public int $shareType = 0;

    public ?string $shareRange = null;

    public array $targetIds = [];

    public ?string $password = null;

    public function getProjectName(): string
    {
        return $this->projectName;
    }

    public function setProjectName(?string $projectName): void
    {
        $this->projectName = trim($projectName ?? '');
    }

    public function getShareType(): int
    {
        return $this->shareType;
    }

    public function setShareType(int|string $shareType): void
    {
        $this->shareType = (int) $shareType;
    }

    public function getShareRange(): ?string
    {
        return $this->shareRange;
    }

    public function setShareRange(?string $shareRange): void
    {
        $this->shareRange = $shareRange;
    }

    public function getTargetIds(): array
    {
        return $this->targetIds;
    }

    public function setTargetIds(?array $targetIds): void
    {
        $this->targetIds = $targetIds ?? [];
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function setPassword(?string $password): void
    {
        $this->password = $password;
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'project_name' => 'required|string|max:100|regex:/.*\S.*/u',
            'share_type' => 'required|integer|in:2,4,5',
            'share_range' => 'required_if:share_type,2|nullable|string|in:all,designated',
            'target_ids' => 'nullable|array',
            'target_ids.*.target_type' => 'required_with:target_ids|string|in:User,Department',
            'target_ids.*.target_id' => 'required_with:target_ids|string|max:64',
            'password' => 'required_if:share_type,5|nullable|string|min:4|max:32',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'project_name.required' => 'Micro app name is required',
            'project_name.regex' => 'Micro app name cannot be blank',
            'share_type.required' => 'Share type is required',
            'share_type.in' => 'Share type must be 2, 4, or 5',
            'share_range.required_if' => 'Share range is required for team share',
            'share_range.in' => 'Share range must be all or designated',
            'password.required_if' => 'Password is required for password protected share',
            'password.min' => 'Password must be at least 4 characters',
            'password.max' => 'Password cannot exceed 32 characters',
        ];
    }
}
