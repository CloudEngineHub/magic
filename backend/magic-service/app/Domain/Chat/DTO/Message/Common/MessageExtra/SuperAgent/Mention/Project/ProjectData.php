<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Project;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionDataInterface;
use App\Infrastructure\Core\AbstractDTO;

final class ProjectData extends AbstractDTO implements MentionDataInterface
{
    protected string $projectId;

    protected string $projectName;

    public function __construct(array $data = [])
    {
        parent::__construct($data);
    }

    public function getProjectId(): ?string
    {
        return $this->projectId ?? null;
    }

    public function getProjectName(): ?string
    {
        return $this->projectName ?? null;
    }

    public function setProjectId(string $projectId): void
    {
        $this->projectId = $projectId;
    }

    public function setProjectName(string $projectName): void
    {
        $this->projectName = $projectName;
    }
}
