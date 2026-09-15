<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Support;

class SelectParser
{
    /**
     * @return array{
     *     fields: list<string>,
     *     relations: array<string, array{source_column: string, fields: list<string>}>
     * }
     */
    public function parse(?string $select): array
    {
        $select = trim((string) $select);
        if ($select === '') {
            return [
                'fields' => [],
                'relations' => [],
            ];
        }

        $result = [
            'fields' => [],
            'relations' => [],
        ];

        foreach ($this->splitTopLevel($select) as $segment) {
            $segment = trim($segment);
            if ($segment === '') {
                continue;
            }

            if (str_contains($segment, '(') && preg_match('/^([^:]+):([^(]+)\((.*)\)$/', $segment, $matches) === 1) {
                $result['relations'][trim($matches[1])] = [
                    'source_column' => trim($matches[2]),
                    'fields' => array_values(array_filter(array_map('trim', $this->splitTopLevel($matches[3])), static fn (string $field): bool => $field !== '')),
                ];
                continue;
            }

            $result['fields'][] = $segment;
        }

        return $result;
    }

    /**
     * @return list<string>
     */
    private function splitTopLevel(string $value): array
    {
        $segments = [];
        $current = '';
        $depth = 0;
        $length = strlen($value);

        for ($index = 0; $index < $length; ++$index) {
            $char = $value[$index];
            if ($char === '(') {
                ++$depth;
                $current .= $char;
                continue;
            }

            if ($char === ')') {
                --$depth;
                $current .= $char;
                continue;
            }

            if ($char === ',' && $depth === 0) {
                $segments[] = $current;
                $current = '';
                continue;
            }

            $current .= $char;
        }

        if ($current !== '') {
            $segments[] = $current;
        }

        return $segments;
    }
}
