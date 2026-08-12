<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Skill\DTO\Response;

use App\Infrastructure\Core\AbstractDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Request\PublishSkillRequestDTO;

/**
 * 发布技能版本表单预填（与 {@see PublishSkillRequestDTO} 字段对齐，便于前端一键提交）.
 */
class SkillPublishPrefillResponseDTO extends AbstractDTO
{
    public function __construct(
        private readonly string $version,
        private readonly array $versionDescriptionI18n,
        private readonly ?string $publishTargetType,
        private readonly ?array $publishTargetValue,
        private readonly bool $exportFileFromProject = true,
    ) {
    }

    public function toArray(): array
    {
        return [
            'version' => $this->version,
            'version_description_i18n' => $this->versionDescriptionI18n,
            'publish_target_type' => $this->publishTargetType,
            'publish_target_value' => $this->publishTargetValue,
            'export_file_from_project' => $this->exportFileFromProject,
        ];
    }
}
