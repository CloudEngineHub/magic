<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\SuperMagic\Utils;

class BatchDownloadArchivePathUtil
{
    private const STRATEGY_VERSION = 'relative_lca_v2';

    /**
     * @param array<int,array{id:int,path:string,is_directory:bool}> $selectedNodes
     * @return array<int,array{id:int,path:string,is_directory:bool}>
     */
    public static function removeRedundantSelections(array $selectedNodes): array
    {
        $normalizedNodes = [];
        foreach ($selectedNodes as $node) {
            $path = self::normalizePath($node['path']);
            if ($path === '') {
                continue;
            }
            $node['path'] = $path;
            $normalizedNodes[] = $node;
        }

        return array_values(array_filter(
            $normalizedNodes,
            static function (array $candidate) use ($normalizedNodes): bool {
                foreach ($normalizedNodes as $parent) {
                    if (
                        ! $parent['is_directory']
                        || $parent['id'] === $candidate['id']
                        || strlen($parent['path']) >= strlen($candidate['path'])
                    ) {
                        continue;
                    }

                    if (str_starts_with($candidate['path'], $parent['path'] . '/')) {
                        return false;
                    }
                }
                return true;
            }
        ));
    }

    /**
     * @param array<int,array{path:string,is_directory:bool}> $selectedNodes
     */
    public static function buildArchiveBasePath(array $selectedNodes): string
    {
        $parentPaths = [];
        foreach ($selectedNodes as $node) {
            $path = self::normalizePath($node['path']);
            if ($path === '') {
                continue;
            }

            $parent = dirname($path);
            $parentPaths[] = $parent === '.' ? '' : self::normalizePath($parent);
        }

        if (empty($parentPaths) || in_array('', $parentPaths, true)) {
            return '';
        }

        $segmentsGroup = array_map(
            static fn (string $path): array => explode('/', $path),
            $parentPaths
        );
        $common = [];
        foreach ($segmentsGroup[0] as $index => $segment) {
            foreach ($segmentsGroup as $segments) {
                if (! isset($segments[$index]) || $segments[$index] !== $segment) {
                    return implode('/', $common);
                }
            }
            $common[] = $segment;
        }

        return implode('/', $common);
    }

    /**
     * @param array<int,array{id:int,path:string,is_directory:bool}> $selectedNodes
     */
    public static function buildCacheSignature(array $selectedNodes, string $archiveBasePath): string
    {
        $signatures = array_map(
            static fn (array $node): string => sprintf(
                '%s:%d:%s',
                $node['is_directory'] ? 'directory' : 'file',
                $node['id'],
                self::normalizePath($node['path'])
            ),
            $selectedNodes
        );
        sort($signatures);

        return self::STRATEGY_VERSION . '|' . self::normalizePath($archiveBasePath) . '|' . implode(',', $signatures);
    }

    public static function workspaceRelativeCacheSignature(): string
    {
        return 'workspace_relative_v2';
    }

    private static function normalizePath(string $path): string
    {
        $normalized = str_replace('\\', '/', trim($path));
        $normalized = preg_replace('#/+#', '/', $normalized) ?? '';
        return trim($normalized, '/');
    }
}
