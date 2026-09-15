<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Project;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\MentionType;
use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Project\ProjectData;
use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\Mention\Project\ProjectMention;
use App\Interfaces\Agent\Assembler\MentionAssembler;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 * @coversNothing
 */
class ProjectMentionTest extends TestCase
{
    public function testProjectDataCreation(): void
    {
        $data = new ProjectData([
            'project_id' => '904730666716749825',
            'project_name' => '更换模型',
        ]);

        $this->assertEquals('904730666716749825', $data->getProjectId());
        $this->assertEquals('更换模型', $data->getProjectName());
    }

    public function testProjectMentionCreation(): void
    {
        $mention = new ProjectMention([
            'type' => 'mention',
            'attrs' => [
                'type' => 'project',
                'data' => [
                    'project_id' => '904730666716749825',
                    'project_name' => '更换模型',
                ],
            ],
        ]);

        $this->assertEquals('mention', $mention->getType());
        $this->assertEquals(MentionType::PROJECT, $mention->getAttrs()->getType());

        $data = $mention->getAttrs()->getData();
        $this->assertInstanceOf(ProjectData::class, $data);
        assert($data instanceof ProjectData);
        $this->assertEquals('904730666716749825', $data->getProjectId());
        $this->assertEquals('更换模型', $data->getProjectName());
    }

    public function testGetMentionTextStruct(): void
    {
        $mention = new ProjectMention([
            'type' => 'mention',
            'attrs' => [
                'type' => 'project',
                'data' => [
                    'project_id' => '904730666716749825',
                    'project_name' => '更换模型',
                ],
            ],
        ]);

        $this->assertEquals('[@project:更换模型]', $mention->getMentionTextStruct());
    }

    public function testGetMentionJsonStruct(): void
    {
        $mention = new ProjectMention([
            'type' => 'mention',
            'attrs' => [
                'type' => 'project',
                'data' => [
                    'project_id' => '904730666716749825',
                    'project_name' => '更换模型',
                ],
            ],
        ]);

        $jsonStruct = $mention->getMentionJsonStruct();
        $this->assertEquals('project', $jsonStruct['type']);
        $this->assertEquals('904730666716749825', $jsonStruct['project_id']);
        $this->assertEquals('更换模型', $jsonStruct['project_name']);
    }

    public function testMentionAssemblerFromArray(): void
    {
        $mentionArray = [
            'type' => 'mention',
            'attrs' => [
                'type' => 'project',
                'data' => [
                    'project_id' => '904730666716749825',
                    'project_name' => '更换模型',
                ],
            ],
        ];

        $mention = MentionAssembler::fromArray($mentionArray);
        $this->assertInstanceOf(ProjectMention::class, $mention);
        assert($mention instanceof ProjectMention);

        $data = $mention->getAttrs()->getData();
        $this->assertInstanceOf(ProjectData::class, $data);
        assert($data instanceof ProjectData);
        $this->assertEquals('904730666716749825', $data->getProjectId());
        $this->assertEquals('更换模型', $data->getProjectName());
    }

    public function testJsonSerializable(): void
    {
        $mention = new ProjectMention([
            'type' => 'mention',
            'attrs' => [
                'type' => 'project',
                'data' => [
                    'project_id' => '904730666716749825',
                    'project_name' => '更换模型',
                ],
            ],
        ]);

        $json = json_encode($mention);
        $this->assertIsString($json);

        $decoded = json_decode($json, true);
        $this->assertEquals('mention', $decoded['type']);
        $this->assertEquals('project', $decoded['attrs']['type']);
        $this->assertEquals('904730666716749825', $decoded['attrs']['data']['project_id']);
        $this->assertEquals('更换模型', $decoded['attrs']['data']['project_name']);
    }
}
