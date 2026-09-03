<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Service;

use App\Domain\SuperMagic\Agent\Entity\AgentSkillEntity;
use App\Domain\SuperMagic\Agent\Entity\SuperMagicAgentEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentTool;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use SplFileInfo;
use ZipArchive;

/**
 * Generates a standards-compliant agent ZIP from a SuperMagicAgentEntity.
 *
 * The produced archive follows the same structure expected by AgentZipParser:
 *
 *   {agent_dir_name}/
 *   ├── IDENTITY.md   (YAML frontmatter: name, role, description + _cn variants)
 *   ├── AGENTS.md     (prompt body; omitted when prompt is empty)
 *   ├── TOOLS.md      (YAML frontmatter tools list; omitted when empty)
 *   └── SKILLS.md     (YAML frontmatter skills list; omitted when empty)
 *
 * The ZIP is written to a temporary directory and the caller is responsible for
 * deleting it after use.
 */
class AgentZipGeneratorService
{
    /**
     * Generate a ZIP archive from the given agent entity.
     *
     * @param null|string $dirName Override the top-level directory name inside the ZIP.
     *                             When null, the resolved agent name / code is used.
     * @return string Absolute path to the generated temp ZIP file
     */
    public function generateFromEntity(SuperMagicAgentEntity $entity, ?string $dirName = null): string
    {
        $agentName = $dirName ?? $this->resolveAgentDirName($entity);

        $tempDir = sys_get_temp_dir() . '/agent_gen_' . uniqid('', true);
        if (! mkdir($tempDir, 0755, true) && ! is_dir($tempDir)) {
            throw new RuntimeException("Failed to create temp directory: {$tempDir}");
        }

        $agentDir = $tempDir . '/' . $agentName;
        if (! mkdir($agentDir, 0755, true) && ! is_dir($agentDir)) {
            throw new RuntimeException("Failed to create agent directory: {$agentDir}");
        }

        try {
            $this->writeIdentityMd($agentDir, $entity);
            $this->writeAgentsMd($agentDir, $entity);
            $this->writeToolsMd($agentDir, $entity);
            $this->writeSkillsMd($agentDir, $entity);

            $zipPath = $tempDir . '/' . $agentName . '.zip';
            $this->createZip($agentDir, $zipPath, $agentName);

            return $zipPath;
        } finally {
            $this->removeDirectory($agentDir);
        }
    }

    /**
     * Public accessor for the agent directory name, used by commands that need
     * to create the local directory structure before calling other methods.
     */
    public function resolveAgentDirNamePublic(SuperMagicAgentEntity $entity): string
    {
        return $this->resolveAgentDirName($entity);
    }

    /**
     * Write IDENTITY.md directly into an existing local directory.
     * Used by ExportAgentsForMigrationCommand when .magic/ lacks IDENTITY.md.
     */
    public function writeIdentityMdToDir(string $agentDir, SuperMagicAgentEntity $entity): void
    {
        $this->writeIdentityMd($agentDir, $entity);
    }

    /**
     * Derive a filesystem-safe directory name from the entity.
     * Uses the English name when available, falls back to the agent code.
     */
    private function resolveAgentDirName(SuperMagicAgentEntity $entity): string
    {
        $nameI18n = $entity->getNameI18n();
        $name = $nameI18n['en_US'] ?? ($nameI18n['default'] ?? '');

        if ($name === '') {
            $name = $entity->getName();
        }

        if ($name === '') {
            $name = $entity->getCode();
        }

        // Strip characters that are unsafe in ZIP entry names / directory names.
        $name = preg_replace('/[\/\\\:*?"<>|]/', '_', $name) ?? $name;
        $name = trim($name);

        return $name !== '' ? $name : 'agent';
    }

    /**
     * Write IDENTITY.md with YAML frontmatter containing the agent's i18n metadata.
     *
     * Mapping from entity to frontmatter keys:
     *   nameI18n['en_US'|'default']        → name
     *   nameI18n['zh_CN']                  → name_cn
     *   roleI18n['en_US'|'default']        → role
     *   roleI18n['zh_CN']                  → role_cn
     *   descriptionI18n['en_US'|'default'] → description
     *   descriptionI18n['zh_CN']           → description_cn
     */
    private function writeIdentityMd(string $agentDir, SuperMagicAgentEntity $entity): void
    {
        $nameI18n = $entity->getNameI18n() ?? [];
        $roleI18n = $entity->getRoleI18n() ?? [];
        $descI18n = $entity->getDescriptionI18n() ?? [];

        $fields = [];

        // name
        $name = $nameI18n['en_US'] ?? ($nameI18n['default'] ?? $entity->getName());
        if ($name !== '') {
            $fields['name'] = $name;
        }
        $nameCn = $nameI18n['zh_CN'] ?? '';
        if ($nameCn !== '') {
            $fields['name_cn'] = $nameCn;
        }

        // role – may be an array in entity but frontmatter expects a scalar
        $role = $this->resolveScalarI18n($roleI18n, 'en_US');
        if ($role !== '') {
            $fields['role'] = $role;
        }
        $roleCn = $this->resolveScalarI18n($roleI18n, 'zh_CN');
        if ($roleCn !== '') {
            $fields['role_cn'] = $roleCn;
        }

        // description
        $desc = $descI18n['en_US'] ?? ($descI18n['default'] ?? $entity->getDescription());
        if ($desc !== '') {
            $fields['description'] = $desc;
        }
        $descCn = $descI18n['zh_CN'] ?? '';
        if ($descCn !== '') {
            $fields['description_cn'] = $descCn;
        }

        $content = $this->buildFrontmatterBlock($fields);
        file_put_contents($agentDir . '/IDENTITY.md', $content);
    }

    /**
     * Write AGENTS.md containing the agent's system-prompt body.
     * The file is omitted when the prompt string is empty.
     */
    private function writeAgentsMd(string $agentDir, SuperMagicAgentEntity $entity): void
    {
        $promptString = $entity->getPromptString();
        if (trim($promptString) === '') {
            return;
        }
        file_put_contents($agentDir . '/AGENTS.md', $promptString);
    }

    /**
     * Write TOOLS.md with a YAML frontmatter `tools:` list of tool codes.
     * The file is omitted when the tools list is empty.
     */
    private function writeToolsMd(string $agentDir, SuperMagicAgentEntity $entity): void
    {
        $tools = $entity->getTools();
        if (empty($tools)) {
            return;
        }

        $toolCodes = array_map(
            static fn (SuperMagicAgentTool $t) => $t->getCode(),
            $tools
        );

        $content = $this->buildListFrontmatterBlock('tools', $toolCodes);
        file_put_contents($agentDir . '/TOOLS.md', $content);
    }

    /**
     * Write SKILLS.md with a YAML frontmatter `skills:` list of skill codes.
     * The file is omitted when the skills list is empty.
     */
    private function writeSkillsMd(string $agentDir, SuperMagicAgentEntity $entity): void
    {
        $skills = $entity->getSkills();
        if (empty($skills)) {
            return;
        }

        $skillCodes = array_map(
            static fn (AgentSkillEntity $s) => $s->getSkillCode(),
            $skills
        );

        $content = $this->buildListFrontmatterBlock('skills', $skillCodes);
        file_put_contents($agentDir . '/SKILLS.md', $content);
    }

    /**
     * Build a YAML frontmatter block from a key→scalar map.
     *
     * String values containing newlines, colons, or quotes are wrapped in
     * double-quoted YAML scalars with inner double-quotes escaped.
     */
    private function buildFrontmatterBlock(array $fields): string
    {
        $lines = ['---'];
        foreach ($fields as $key => $value) {
            $lines[] = $key . ': ' . $this->yamlScalar((string) $value);
        }
        $lines[] = '---';
        $lines[] = '';

        return implode("\n", $lines);
    }

    /**
     * Build a YAML frontmatter block with a single list key.
     *
     * @param array<string> $items
     */
    private function buildListFrontmatterBlock(string $key, array $items): string
    {
        $lines = ['---', $key . ':'];
        foreach ($items as $item) {
            $lines[] = '  - ' . $this->yamlScalar($item);
        }
        $lines[] = '---';
        $lines[] = '';

        return implode("\n", $lines);
    }

    /**
     * Encode a string value as a YAML scalar.
     *
     * Plain scalars are used when safe; double-quoted scalars are used when
     * the value contains special YAML characters.
     */
    private function yamlScalar(string $value): string
    {
        if (preg_match('/[:\'"#\n\r\t\\\{}\[\]|>&*!,%@`]/', $value) || str_starts_with($value, ' ') || str_ends_with($value, ' ')) {
            $escaped = str_replace(['\\', '"', "\n", "\r", "\t"], ['\\\\', '\"', '\n', '\r', '\t'], $value);
            return '"' . $escaped . '"';
        }

        return $value === '' ? '""' : $value;
    }

    /**
     * Resolve a scalar from an i18n array that may hold either a string or array of strings.
     */
    private function resolveScalarI18n(array $i18n, string $locale): string
    {
        $value = $i18n[$locale] ?? ($i18n['default'] ?? '');

        if (is_array($value)) {
            $value = implode(', ', $value);
        }

        return trim((string) $value);
    }

    /**
     * Package the contents of $agentDir into a ZIP file at $zipPath.
     * All entries are stored under the top-level directory $agentDirName.
     */
    private function createZip(string $agentDir, string $zipPath, string $agentDirName): void
    {
        $zip = new ZipArchive();
        $result = $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        if ($result !== true) {
            throw new RuntimeException("Failed to create ZIP archive at {$zipPath} (code: {$result})");
        }

        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($agentDir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($files as $file) {
            /** @var SplFileInfo $file */
            $realPath = $file->getRealPath();
            if ($realPath === false) {
                continue;
            }
            $relativePath = $agentDirName . '/' . substr($realPath, strlen($agentDir) + 1);
            $relativePath = str_replace('\\', '/', $relativePath);

            if ($file->isDir()) {
                $zip->addEmptyDir($relativePath, ZipArchive::FL_ENC_UTF_8);
            } else {
                $zip->addFile($realPath, $relativePath, 0, 0, ZipArchive::FL_ENC_UTF_8);
            }
        }

        $zip->close();
    }

    /**
     * Recursively remove a local directory and all its contents.
     */
    private function removeDirectory(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }

        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($items as $item) {
            /** @var SplFileInfo $item */
            if ($item->isDir()) {
                @rmdir($item->getRealPath());
            } else {
                @unlink($item->getRealPath());
            }
        }

        @rmdir($dir);
    }
}
