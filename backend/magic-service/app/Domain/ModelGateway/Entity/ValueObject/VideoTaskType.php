<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Entity\ValueObject;

/**
 * 视频任务类型。
 */
enum VideoTaskType: string
{
    // 普通生成：文生、图生、参考素材生成等默认任务。
    case Generate = 'generate';

    // 视频延长：基于已有视频继续生成后续片段。
    case Extend = 'extend';

    // 视频编辑：以已有视频为输入做改写或重生成。
    case Edit = 'edit';

    // 视频超清：对已有视频做清晰度增强。
    case Upscale = 'upscale';

    // 样片成片：基于已生成的样片任务 ID 出正式分辨率的成片，当前仅 Seedance 2.5 支持。
    case DraftTask = 'draft_task';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(
            static fn (self $taskType): string => $taskType->value,
            self::cases(),
        );
    }

    public static function isValid(string $value): bool
    {
        return self::tryFrom($value) instanceof self;
    }

    public function supportsInputMode(string $inputMode): bool
    {
        return match ($this) {
            self::Edit => $inputMode === VideoInputMode::VideoEdit->value,
            self::DraftTask => $inputMode === VideoInputMode::DraftTask->value,
            self::Generate => $inputMode !== VideoInputMode::VideoEdit->value
                && $inputMode !== VideoInputMode::DraftTask->value,
            self::Extend, self::Upscale => $inputMode === VideoInputMode::Standard->value,
        };
    }

    public function requiredSupportedInput(): ?string
    {
        return match ($this) {
            self::Edit => 'video_edit',
            self::Extend => 'video_extension',
            self::Upscale => 'video_upscale',
            self::DraftTask => 'video_draft_task',
            self::Generate => null,
        };
    }

    public function requiresReferenceVideo(): bool
    {
        // 样片成片的输入是样片任务 ID，不是参考视频，因此与普通生成一样不强制参考视频。
        return ! in_array($this, [self::Generate, self::DraftTask], true);
    }
}
