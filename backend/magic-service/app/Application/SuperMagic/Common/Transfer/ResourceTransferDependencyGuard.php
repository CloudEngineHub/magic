<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Transfer;

use App\Application\KnowledgeBase\Service\KnowledgeBaseAppService;
use App\Application\SuperMagic\Common\Collaboration\Policy\ResourceAccessPolicyService;
use App\Domain\Contact\Entity\MagicUserEntity;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\ResourceType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType as VisibilityResourceType;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use App\Domain\SuperMagic\Agent\Service\SuperMagicAgentSkillDomainService;
use App\Domain\SuperMagic\Skill\Service\SkillMarketDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Qbhy\HyperfAuth\Authenticatable;
use RuntimeException;

/** Dependencies remain owned by their authors; transferring must not widen their visibility. */
class ResourceTransferDependencyGuard
{
    private const KNOWLEDGE_PAGE_SIZE = 100;

    // Dependency reads run while the resource is locked; never allow unbounded RPC work.
    private const MAX_KNOWLEDGE_PAGES = 10;

    public function __construct(
        private readonly ResourceAccessPolicyService $policy,
        private readonly SuperMagicAgentSkillDomainService $skills,
        private readonly SkillMarketDomainService $skillMarket,
        private readonly KnowledgeBaseAppService $knowledge,
    ) {
    }

    public function assertAgentDependencies(Authenticatable $sender, MagicUserEntity $receiver, string $code): void
    {
        $org = $sender->getOrganizationCode();
        $receiverIsolation = SuperMagicAgentDataIsolation::create($org, $receiver->getUserId());
        $agentSkills = $this->skills->getByAgentCodeForCurrentVersion(SuperMagicAgentDataIsolation::create($org, $sender->getId()), $code);
        // Official built-in and published market skills are available to everyone and carry no per-user grants.
        $publicCodes = array_merge(
            $this->skillMarket->getOfficialBuiltinSkillCodes(),
            $this->skillMarket->getPublishedSkillCodes(array_map(static fn ($skill) => $skill->getSkillCode(), $agentSkills))
        );
        foreach ($agentSkills as $skill) {
            if (in_array($skill->getSkillCode(), $publicCodes, true)) {
                continue;
            }
            $this->policy->assertReadable($receiverIsolation, ResourceType::Skill, VisibilityResourceType::SKILL, $skill->getSkillCode());
        }
        $receiverAuthorization = MagicUserAuthorization::fromUserEntity($receiver);
        $checkedCodes = [];
        for ($page = 1; $page <= self::MAX_KNOWLEDGE_PAGES; ++$page) {
            $result = $this->knowledge->queriesRaw($sender, ['agent_codes' => [$code], 'page' => $page, 'page_size' => self::KNOWLEDGE_PAGE_SIZE]);
            $items = $result['list'] ?? null;
            if (! is_array($items) || count($items) > self::KNOWLEDGE_PAGE_SIZE) {
                throw new RuntimeException('Invalid knowledge-base dependency page.');
            }
            foreach ($items as $item) {
                $knowledgeCode = is_array($item) ? ($item['code'] ?? null) : null;
                if (! is_string($knowledgeCode) || $knowledgeCode === '' || isset($checkedCodes[$knowledgeCode])) {
                    // Fail closed instead of treating a repeated/truncated scan as complete authorization.
                    throw new RuntimeException('Knowledge-base dependency pagination did not advance.');
                }
                $this->knowledge->showRaw($receiverAuthorization, $knowledgeCode);
                $checkedCodes[$knowledgeCode] = true;
            }
            if (count($items) < self::KNOWLEDGE_PAGE_SIZE) {
                return;
            }
        }
        throw new RuntimeException('Knowledge-base dependency verification exceeded its page limit.');
    }
}
