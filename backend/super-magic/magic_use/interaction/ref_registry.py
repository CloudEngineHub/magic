from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import replace

from magic_use.errors import RefNotFoundError, StaleRefError
from magic_use.models.refs import ElementRefRecord


class RefRegistry:
    """管理短 ref 与页面 document generation 的绑定关系。"""

    def __init__(self) -> None:
        self._next_ref = 1
        self._records: dict[str, ElementRefRecord] = {}
        self._page_refs: dict[str, set[str]] = defaultdict(set)
        self._fingerprint_refs: dict[tuple[str, int, str], str] = {}
        self._backend_refs: dict[tuple[str, int, int], str] = {}
        self._stale_ref_ranges: dict[str, list[tuple[int, int]]] = defaultdict(list)

    def register(self, record: ElementRefRecord) -> ElementRefRecord:
        if record.backend_node_id is not None:
            backend_key = (record.page_id, record.document_generation, record.backend_node_id)
            backend_ref = self._backend_refs.get(backend_key)
            if backend_ref is not None:
                updated = replace(record, ref=backend_ref)
                self._records[backend_ref] = updated
                return updated

        fingerprint_key = (record.page_id, record.document_generation, record.stable_fingerprint)
        existing_ref = self._fingerprint_refs.get(fingerprint_key)
        if existing_ref is not None:
            existing = self._records.get(existing_ref)
            if existing is not None and self._same_identity(existing, record):
                updated = replace(record, ref=existing_ref)
                self._records[existing_ref] = updated
                return updated

        ref = f"e{self._next_ref}"
        self._next_ref += 1
        registered = replace(record, ref=ref)
        self._records[ref] = registered
        self._page_refs[record.page_id].add(ref)
        self._fingerprint_refs[fingerprint_key] = ref
        if record.backend_node_id is not None:
            self._backend_refs[(record.page_id, record.document_generation, record.backend_node_id)] = ref
        return registered

    def resolve(self, ref: str, *, page_id: str, document_generation: int) -> ElementRefRecord:
        record = self._records.get(ref)
        if record is None:
            if self._is_stale_ref(ref, page_id):
                raise StaleRefError(ref)
            raise RefNotFoundError(ref)
        if record.page_id != page_id:
            raise RefNotFoundError(ref)
        if record.document_generation != document_generation:
            raise StaleRefError(ref)
        return record

    def get(self, ref: str) -> ElementRefRecord:
        record = self._records.get(ref)
        if record is None:
            if any(self._is_stale_ref(ref, page_id) for page_id in self._stale_ref_ranges):
                raise StaleRefError(ref)
            raise RefNotFoundError(ref)
        return record

    def clear_page(self, page_id: str) -> None:
        refs = self._page_refs.pop(page_id, set())
        self._stale_ref_ranges.pop(page_id, None)
        for ref in refs:
            record = self._records.pop(ref, None)
            if record is not None:
                self._fingerprint_refs.pop(
                    (record.page_id, record.document_generation, record.stable_fingerprint),
                    None,
                )
                if record.backend_node_id is not None:
                    self._backend_refs.pop(
                        (record.page_id, record.document_generation, record.backend_node_id),
                        None,
                    )

    def clear(self) -> None:
        for page_id in tuple(self._page_refs):
            self.clear_page(page_id)

    def clear_stale_generations(self, page_id: str, current_generation: int) -> None:
        stale_refs = {
            ref
            for ref in self._page_refs.get(page_id, set())
            if self._records[ref].document_generation != current_generation
        }
        stale_ids: list[int] = []
        for ref in stale_refs:
            record = self._records.pop(ref)
            self._page_refs[page_id].discard(ref)
            ref_id = self._ref_id(ref)
            if ref_id is not None:
                stale_ids.append(ref_id)
            self._fingerprint_refs.pop(
                (record.page_id, record.document_generation, record.stable_fingerprint),
                None,
            )
            if record.backend_node_id is not None:
                self._backend_refs.pop(
                    (record.page_id, record.document_generation, record.backend_node_id),
                    None,
                )
        if stale_ids:
            self._stale_ref_ranges[page_id] = self._merge_ranges(
                self._stale_ref_ranges[page_id],
                stale_ids,
            )

    def _is_stale_ref(self, ref: str, page_id: str) -> bool:
        ref_id = self._ref_id(ref)
        if ref_id is None:
            return False
        return any(start <= ref_id <= end for start, end in self._stale_ref_ranges.get(page_id, ()))

    @staticmethod
    def _ref_id(ref: str) -> int | None:
        if not ref.startswith("e") or not ref[1:].isdigit():
            return None
        return int(ref[1:])

    @staticmethod
    def _merge_ranges(existing: list[tuple[int, int]], new_ids: list[int]) -> list[tuple[int, int]]:
        ranges = [*existing, *((ref_id, ref_id) for ref_id in new_ids)]
        ranges.sort()
        merged: list[tuple[int, int]] = []
        for start, end in ranges:
            if not merged or start > merged[-1][1] + 1:
                merged.append((start, end))
                continue
            previous_start, previous_end = merged[-1]
            merged[-1] = (previous_start, max(previous_end, end))
        return merged

    @staticmethod
    def fingerprint(
        *,
        role: str,
        name: str,
        frame_id: str,
        attributes: dict[str, str],
        structural_path: tuple[int, ...],
    ) -> str:
        stable_attributes = tuple(
            sorted(
                (key, value)
                for key, value in attributes.items()
                if key in {"id", "name", "aria-label", "data-testid", "type"}
            )
        )
        payload = repr((role, name, frame_id, stable_attributes, structural_path)).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()[:24]

    @staticmethod
    def _same_identity(left: ElementRefRecord, right: ElementRefRecord) -> bool:
        if left.backend_node_id is not None and right.backend_node_id is not None:
            return left.backend_node_id == right.backend_node_id
        return left.structural_path == right.structural_path
