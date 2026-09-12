<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\SuperMagic\Task\Service;

use App\Domain\SuperMagic\Task\Service\CrossProjectMentionPathTranslator;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class CrossProjectMentionPathTranslatorTest extends TestCase
{
    public function testTranslateWritesProjectPathForMicroApp(): void
    {
        $translator = new CrossProjectMentionPathTranslator();

        $result = $translator->translate(
            [
                [
                    'type' => 'micro_app',
                    'app_id' => '3001',
                    'project_id' => '4001',
                ],
            ],
            1001,
            '/mnt/agfs/magicfs/referenced-projects',
        );

        self::assertSame(
            '/mnt/agfs/magicfs/referenced-projects/4001',
            $result[0]['project_path'],
        );
    }

    public function testTranslateSkipsMicroAppWithoutProjectId(): void
    {
        $translator = new CrossProjectMentionPathTranslator();
        $mention = ['type' => 'micro_app', 'app_id' => '3001'];

        $result = $translator->translate([$mention], 1001, '/mnt/agfs/magicfs/referenced-projects');

        self::assertArrayNotHasKey('project_path', $result[0]);
    }

    public function testTranslateWritesProjectPathForProjectMention(): void
    {
        $translator = new CrossProjectMentionPathTranslator();

        $result = $translator->translate(
            [
                [
                    'type' => 'project',
                    'project_id' => '4002',
                ],
            ],
            1001,
            '/mnt/agfs/magicfs/referenced-projects',
        );

        self::assertSame(
            '/mnt/agfs/magicfs/referenced-projects/4002',
            $result[0]['project_path'],
        );
    }

    public function testTranslateSkipsMicroAppOnCurrentProject(): void
    {
        $translator = new CrossProjectMentionPathTranslator();

        $result = $translator->translate(
            [
                [
                    'type' => 'micro_app',
                    'app_id' => '3001',
                    'project_id' => '1001',
                ],
            ],
            1001,
            '/mnt/agfs/magicfs/referenced-projects',
        );

        self::assertArrayNotHasKey('project_path', $result[0]);
    }
}
