<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Project;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\AbstractMention;
use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionType;

final class ProjectMention extends AbstractMention
{
    public function getMentionTextStruct(): string
    {
        $data = $this->getAttrs()?->getData();
        if (! $data instanceof ProjectData) {
            return '';
        }

        $projectName = $data->getProjectName() ?? '';
        return sprintf('[@project:%s]', $projectName);
    }

    public function getMentionJsonStruct(): array
    {
        $data = $this->getAttrs()?->getData();
        if (! $data instanceof ProjectData) {
            return [];
        }

        return [
            'type' => MentionType::PROJECT->value,
            'project_id' => $data->getProjectId(),
            'project_name' => $data->getProjectName(),
        ];
    }
}
