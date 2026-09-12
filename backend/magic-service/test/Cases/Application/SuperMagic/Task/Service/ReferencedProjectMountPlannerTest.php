<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Task\Service;

use App\Application\SuperMagic\Task\Service\ReferencedProjectAccessKind;
use App\Application\SuperMagic\Task\Service\ReferencedProjectMountPlanner;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class ReferencedProjectMountPlannerTest extends TestCase
{
    public function testPlanMapsMicroAppToPublishedShare(): void
    {
        $planner = new ReferencedProjectMountPlanner();

        $mounts = $planner->plan([
            [
                'type' => 'micro_app',
                'app_id' => '3001',
                'project_id' => '4001',
            ],
        ], 1001);

        self::assertCount(1, $mounts);
        self::assertSame('4001', $mounts[0]->projectId);
        self::assertSame(ReferencedProjectAccessKind::PublishedShare, $mounts[0]->accessKind);
        self::assertSame('micro_app', $mounts[0]->sourceType);
        self::assertSame('3001', $mounts[0]->appId);
    }

    public function testPlanMapsProjectMentionsToCollaboration(): void
    {
        $planner = new ReferencedProjectMountPlanner();

        $mounts = $planner->plan([
            ['type' => 'project', 'project_id' => '4002'],
            ['type' => 'project_file', 'project_id' => '4003'],
            ['type' => 'project_directory', 'project_id' => '4004'],
        ], 1001);

        self::assertCount(3, $mounts);
        self::assertSame(ReferencedProjectAccessKind::Collaboration, $mounts[0]->accessKind);
        self::assertSame('project', $mounts[0]->sourceType);
        self::assertSame(ReferencedProjectAccessKind::Collaboration, $mounts[1]->accessKind);
        self::assertSame('project_file', $mounts[1]->sourceType);
        self::assertSame(ReferencedProjectAccessKind::Collaboration, $mounts[2]->accessKind);
        self::assertSame('project_directory', $mounts[2]->sourceType);
    }

    public function testPlanSkipsCurrentProjectAndEmptyProjectId(): void
    {
        $planner = new ReferencedProjectMountPlanner();

        $mounts = $planner->plan([
            ['type' => 'micro_app', 'app_id' => '3001', 'project_id' => '1001'],
            ['type' => 'project', 'project_id' => ''],
            ['type' => 'project_file'],
        ], 1001);

        self::assertSame([], $mounts);
    }

    public function testPlanPrefersCollaborationWhenSameProjectIsMixed(): void
    {
        $planner = new ReferencedProjectMountPlanner();

        $mounts = $planner->plan([
            ['type' => 'micro_app', 'app_id' => '3001', 'project_id' => '4001'],
            ['type' => 'project', 'project_id' => '4001'],
        ], 1001);

        self::assertCount(1, $mounts);
        self::assertSame('4001', $mounts[0]->projectId);
        self::assertSame(ReferencedProjectAccessKind::Collaboration, $mounts[0]->accessKind);
        self::assertSame('project', $mounts[0]->sourceType);
    }

    public function testPlanSkipsMicroAppWithoutAppId(): void
    {
        $planner = new ReferencedProjectMountPlanner();

        $mounts = $planner->plan([
            ['type' => 'micro_app', 'project_id' => '4001'],
        ], 1001);

        self::assertSame([], $mounts);
    }

    public function testPlanMapsPasswordMicroAppWithCollaborationHint(): void
    {
        $planner = new ReferencedProjectMountPlanner();

        $mounts = $planner->plan([
            [
                'type' => 'micro_app',
                'app_id' => '3001',
                'project_id' => '4001',
                'access_kind' => ReferencedProjectAccessKind::Collaboration->value,
            ],
        ], 1001);

        self::assertCount(1, $mounts);
        self::assertSame('4001', $mounts[0]->projectId);
        self::assertSame(ReferencedProjectAccessKind::Collaboration, $mounts[0]->accessKind);
        self::assertSame('micro_app', $mounts[0]->sourceType);
        self::assertSame('3001', $mounts[0]->appId);
    }
}
