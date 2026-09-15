from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import replace
from typing import TypeAlias

from magic_use.errors import RefNotFoundError, StaleRefError
from magic_use.models.refs import ElementRefRecord

_FingerprintKey: TypeAlias = tuple[str, int, str]
_BackendKey: TypeAlias = tuple[str, int, int]
_StrongIdentityKey: TypeAlias = tuple[str, int, str, str, str, str]


class RefRegistry:
    """管理短 ref 与页面 document generation 的绑定关系。"""

    def __init__(self) -> None:
        self._next_ref = 1
        self._records: dict[str, ElementRefRecord] = {}
        self._page_refs: dict[str, set[str]] = defaultdict(set)
        self._backend_refs: dict[_BackendKey, str] = {}
        self._stale_ref_ranges: dict[str, list[tuple[int, int]]] = defaultdict(list)

    def reconcile(self, records: tuple[ElementRefRecord, ...]) -> tuple[ElementRefRecord, ...]:
        """在一次 Snapshot 的完整候选集合中安全复用同文档 Ref。"""
        if not records:
            return ()
        page_id = records[0].page_id
        generation = records[0].document_generation
        if any(record.page_id != page_id or record.document_generation != generation for record in records):
            raise ValueError("Ref reconciliation requires one page and document generation")

        existing_records = tuple(
            self._records[ref]
            for ref in self._page_refs.get(page_id, ())
            if ref in self._records and self._records[ref].document_generation == generation
        )
        current_strong = self._group_strong_identities(records)
        existing_strong = self._group_strong_identities(existing_records)
        current_fingerprints = self._group_fingerprints(records)
        existing_fingerprints = self._group_fingerprints(existing_records)
        consumed_refs: set[str] = set()
        reconciled: list[ElementRefRecord] = []

        for record in records:
            matched_ref = self._match_backend(record, consumed_refs)
            if matched_ref is None:
                matched_ref = self._match_strong_identity(
                    record,
                    current_strong=current_strong,
                    existing_strong=existing_strong,
                    consumed_refs=consumed_refs,
                )
            if matched_ref is None:
                matched_ref = self._match_fingerprint(
                    record,
                    current_fingerprints=current_fingerprints,
                    existing_fingerprints=existing_fingerprints,
                    consumed_refs=consumed_refs,
                )

            if matched_ref is None:
                registered = self._create_record(record)
            else:
                registered = self._update_record(matched_ref, record)
                consumed_refs.add(matched_ref)
            reconciled.append(registered)
        return tuple(reconciled)

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
                if record.backend_node_id is not None:
                    key = (record.page_id, record.document_generation, record.backend_node_id)
                    if self._backend_refs.get(key) == ref:
                        self._backend_refs.pop(key, None)

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
            if record.backend_node_id is not None:
                key = (record.page_id, record.document_generation, record.backend_node_id)
                if self._backend_refs.get(key) == ref:
                    self._backend_refs.pop(key, None)
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

    def _match_backend(self, record: ElementRefRecord, consumed_refs: set[str]) -> str | None:
        if record.backend_node_id is None:
            return None
        ref = self._backend_refs.get((record.page_id, record.document_generation, record.backend_node_id))
        if ref is None or ref in consumed_refs:
            return None
        existing = self._records.get(ref)
        if existing is None:
            return None
        if self._compatible_identity(existing, record):
            return ref
        self._retire_ref(ref)
        consumed_refs.add(ref)
        return None

    def _match_strong_identity(
        self,
        record: ElementRefRecord,
        *,
        current_strong: dict[_StrongIdentityKey, list[ElementRefRecord]],
        existing_strong: dict[_StrongIdentityKey, list[ElementRefRecord]],
        consumed_refs: set[str],
    ) -> str | None:
        for key in self._strong_identity_keys(record):
            current = current_strong.get(key, ())
            existing = existing_strong.get(key, ())
            if len(current) != 1 or len(existing) != 1:
                continue
            existing_record = existing[0]
            if existing_record.ref in consumed_refs or existing_record.ref not in self._records:
                continue
            if self._compatible_identity(existing_record, record):
                return existing_record.ref
            self._retire_ref(existing_record.ref)
            consumed_refs.add(existing_record.ref)
        return None

    def _match_fingerprint(
        self,
        record: ElementRefRecord,
        *,
        current_fingerprints: dict[_FingerprintKey, list[ElementRefRecord]],
        existing_fingerprints: dict[_FingerprintKey, list[ElementRefRecord]],
        consumed_refs: set[str],
    ) -> str | None:
        key = (record.page_id, record.document_generation, record.stable_fingerprint)
        current = current_fingerprints.get(key, ())
        existing = existing_fingerprints.get(key, ())
        if len(current) != 1 or len(existing) != 1:
            return None
        existing_record = existing[0]
        if existing_record.ref in consumed_refs or existing_record.ref not in self._records:
            return None
        if self._compatible_identity(existing_record, record):
            return existing_record.ref
        self._retire_ref(existing_record.ref)
        consumed_refs.add(existing_record.ref)
        return None

    def _create_record(self, record: ElementRefRecord) -> ElementRefRecord:
        ref = f"e{self._next_ref}"
        self._next_ref += 1
        registered = replace(record, ref=ref)
        self._store_record(registered)
        return registered

    def _update_record(self, ref: str, record: ElementRefRecord) -> ElementRefRecord:
        existing = self._records.get(ref)
        if existing is not None:
            self._remove_indexes(existing, ref)
        updated = replace(record, ref=ref)
        self._store_record(updated)
        return updated

    def _store_record(self, record: ElementRefRecord) -> None:
        self._records[record.ref] = record
        self._page_refs[record.page_id].add(record.ref)
        if record.backend_node_id is not None:
            self._backend_refs[(record.page_id, record.document_generation, record.backend_node_id)] = record.ref

    def _retire_ref(self, ref: str) -> None:
        record = self._records.pop(ref, None)
        if record is None:
            return
        self._page_refs[record.page_id].discard(ref)
        self._remove_indexes(record, ref)
        ref_id = self._ref_id(ref)
        if ref_id is not None:
            self._stale_ref_ranges[record.page_id] = self._merge_ranges(
                self._stale_ref_ranges[record.page_id],
                [ref_id],
            )

    def _remove_indexes(self, record: ElementRefRecord, ref: str) -> None:
        if record.backend_node_id is not None:
            key = (record.page_id, record.document_generation, record.backend_node_id)
            if self._backend_refs.get(key) == ref:
                self._backend_refs.pop(key, None)

    @classmethod
    def _group_strong_identities(
        cls,
        records: tuple[ElementRefRecord, ...],
    ) -> dict[_StrongIdentityKey, list[ElementRefRecord]]:
        grouped: dict[_StrongIdentityKey, list[ElementRefRecord]] = defaultdict(list)
        for record in records:
            for key in cls._strong_identity_keys(record):
                grouped[key].append(record)
        return grouped

    @staticmethod
    def _group_fingerprints(
        records: tuple[ElementRefRecord, ...],
    ) -> dict[_FingerprintKey, list[ElementRefRecord]]:
        grouped: dict[_FingerprintKey, list[ElementRefRecord]] = defaultdict(list)
        for record in records:
            grouped[(record.page_id, record.document_generation, record.stable_fingerprint)].append(record)
        return grouped

    @staticmethod
    def _strong_identity_keys(record: ElementRefRecord) -> tuple[_StrongIdentityKey, ...]:
        prefix = (record.page_id, record.document_generation, record.frame_id, record.role)
        attributes = record.attributes
        keys: list[_StrongIdentityKey] = []
        if value := attributes.get("id"):
            keys.append((*prefix, "id", value))
        if value := attributes.get("data-testid"):
            keys.append((*prefix, "data-testid", value))
        name = attributes.get("name")
        element_type = attributes.get("type")
        if name and element_type:
            keys.append((*prefix, "name-type", f"{name}\0{element_type}"))
        if value := attributes.get("aria-label"):
            keys.append((*prefix, "aria-label", value))
        return tuple(keys)

    @staticmethod
    def _compatible_identity(left: ElementRefRecord, right: ElementRefRecord) -> bool:
        return (
            left.frame_id == right.frame_id
            and left.role == right.role
            and left.allowed_actions == right.allowed_actions
        )
