#!/usr/bin/env python3
"""FL-4162 step 9 — derive ActorVisualProfile requirements from reviewed decisions.

This is a requirements surface only. It does not write ActorVisualProfile source,
does not feed a compiler, and does not claim runtime visual truth.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import decision_capture as decisions

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "actor_visual_profile_requirements/v1"
SURFACE_KIND = "actor_visual_profile_requirements_from_review_decisions"
DEFAULT_DECISIONS = REPO_ROOT / "docs/research/ascii/semantic_maps/source_layer_review_decisions.jsonl"
DEFAULT_CARDS = REPO_ROOT / "docs/research/ascii/semantic_maps/layer_evidence_cards.jsonl"
DEFAULT_OUT = REPO_ROOT / "docs/research/ascii/semantic_maps/actor_visual_profile_requirements.json"


class RequirementDerivationError(Exception):
    pass


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            text = line.strip()
            if not text:
                continue
            try:
                row = json.loads(text)
            except json.JSONDecodeError as exc:
                raise RequirementDerivationError(f"{path}:{line_no}: malformed JSONL: {exc}") from exc
            if not isinstance(row, dict):
                raise RequirementDerivationError(f"{path}:{line_no}: JSONL row must be an object")
            rows.append(row)
    return rows


def load_evidence_cards(path: Path) -> dict[str, dict[str, Any]]:
    cards: dict[str, dict[str, Any]] = {}
    for card in _read_jsonl(path):
        key = str(card.get("source_key") or card.get("card_id") or "")
        if not key:
            raise RequirementDerivationError(f"{path}: evidence card missing source_key/card_id")
        cards[key] = card
    return cards


def load_review_decisions(path: Path) -> dict[str, dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for row in _read_jsonl(path):
        key = str(row.get("source_key") or "")
        if not key:
            raise RequirementDerivationError(f"{path}: decision missing source_key")
        by_key[key] = row
    return by_key


def _presentation_candidates(family: str) -> list[str]:
    if family == "plydie":
        return ["plydie"]
    if family in {"attack", "wolack"}:
        return ["attack"]
    return ["idle_walk"]


def _slot_candidates(role: str, family: str, layer_index: int | None) -> list[str]:
    text = role.lower().replace("-", "_").replace(" ", "_")
    slots: list[str] = []
    if "helmet" in text or "head" in text:
        slots.append("head")
    if "armor" in text or "armour" in text or "chest" in text:
        slots.append("chest")
    if "crossbow" in text or "sword" in text or "weapon" in text or "swoosh" in text:
        slots.append("weapon")
    if "shield" in text:
        slots.append("shield")
    if "rider" in text:
        slots.append("mount_rider")
    if "front" in text:
        slots.append("mount_front")
    if "rear" in text:
        slots.append("mount_rear")
    if "mount" in text or family in {"bigbee", "wolfie", "wolack"}:
        if "mount_rider" not in slots and "rider" not in text:
            slots.append("mount_rear")
    if not slots and layer_index == 2:
        slots.append("body")
    if not slots:
        slots.append("unresolved_slot")
    return sorted(set(slots))


def _requirement_blockers(decision: dict[str, Any], card: dict[str, Any]) -> list[str]:
    blockers = {
        "not_actor_visual_profile_source",
        "not_compiler_input",
        "needs_reachable_server_state_join",
        "needs_family_topology_contract",
        "needs_semantic_mask_coverage",
        "needs_runtime_visual_proof",
    }
    if decision.get("authority") is not False or decision.get("is_proposal") is not True:
        blockers.add("decision_authority_flags_invalid")
    if str(card.get("hand", {}).get("status", "")).lower() in {"partial", "reject", "ambig"}:
        blockers.add("decision_from_non_accept_hand_status")
    roles = decision.get("composite_roles") or []
    if len(roles) > 1:
        blockers.add("composite_layer_requires_family_contract")
    return sorted(blockers)


def _verify_fingerprint(decision: dict[str, Any], card: dict[str, Any]) -> None:
    expected = decision.get("source_card_fingerprint")
    actual = decisions.card_fingerprint(card)
    if expected != actual:
        key = decision.get("source_key")
        raise RequirementDerivationError(
            f"{key}: source_card_fingerprint mismatch; expected {expected}, actual {actual}"
        )


def build_requirement(decision: dict[str, Any], card: dict[str, Any]) -> dict[str, Any]:
    _verify_fingerprint(decision, card)
    source_key = str(decision["source_key"])
    family = str(decision.get("family") or card.get("family") or "")
    raw_layer_index = decision.get("raw_layer_index", card.get("raw_layer_index"))
    roles = list(decision.get("composite_roles") or [decision.get("approved_role")])
    roles = [str(role).strip() for role in roles if str(role).strip()]
    slot_candidates = sorted(
        {slot for role in roles for slot in _slot_candidates(role, family, raw_layer_index)}
    )
    return {
        "requirement_id": f"avp_req:{source_key}",
        "authority": False,
        "is_proposal": True,
        "source_key": source_key,
        "source_xp_path": decision.get("source_xp_path") or card.get("source_xp_path"),
        "raw_layer_index": raw_layer_index,
        "family": family,
        "approved_role": decision.get("approved_role"),
        "composite_roles": roles,
        "presentation_kind_candidates": _presentation_candidates(family),
        "slot_candidates": slot_candidates,
        "actor_visual_profile_fields_required_later": [
            "profile_id",
            "skin_definition_id",
            "presentation_kind",
            "domain",
            "layers[].slot",
            "layers[].layer_definition_id",
            "layers[].xp_ref",
            "layers[].source_layer_index",
            "source_refs.xp_file",
            "metadata.source_review_decision",
        ],
        "review_decision_ref": {
            "schema": decision.get("schema"),
            "source_card_fingerprint": decision.get("source_card_fingerprint"),
            "source_final_sha256": decision.get("source_final_sha256"),
            "review_provenance": decision.get("review_provenance", {}),
        },
        "evidence_card_ref": {
            "card_id": card.get("card_id"),
            "hand_status": card.get("hand", {}).get("status"),
            "hand_label": card.get("hand", {}).get("corrected_label"),
            "machine_guess": card.get("hand", {}).get("pre_guess"),
            "frame_topology": card.get("engine", {}).get("frame_topology"),
            "glyph_exact_group_id": card.get("groups", {}).get("glyph_exact_group_id"),
        },
        "promotion_blockers": _requirement_blockers(decision, card),
    }


def build_requirements_packet(
    decision_rows: dict[str, dict[str, Any]],
    cards: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    requirements: list[dict[str, Any]] = []
    missing_cards: list[str] = []
    for key in sorted(decision_rows):
        card = cards.get(key)
        if card is None:
            missing_cards.append(key)
            continue
        requirements.append(build_requirement(decision_rows[key], card))

    state_counts = Counter(req["evidence_card_ref"]["hand_status"] for req in requirements)
    family_counts = Counter(req["family"] for req in requirements)
    return {
        "schema": SCHEMA,
        "surface_kind": SURFACE_KIND,
        "authority": False,
        "is_proposal": True,
        "status": "requirements_only_not_authoring",
        "source_inputs": {
            "decisions": "docs/research/ascii/semantic_maps/source_layer_review_decisions.jsonl",
            "evidence_cards": "docs/research/ascii/semantic_maps/layer_evidence_cards.jsonl",
        },
        "non_authority_boundary": [
            "This packet derives ActorVisualProfile requirements only.",
            "It does not create ActorVisualProfile rows.",
            "It does not feed compiler enforcement.",
            "It does not prove runtime visuals.",
        ],
        "summary": {
            "decision_rows": len(decision_rows),
            "requirements": len(requirements),
            "missing_cards": len(missing_cards),
            "hand_status_counts": dict(sorted(state_counts.items())),
            "family_counts": dict(sorted(family_counts.items())),
        },
        "missing_cards": missing_cards,
        "requirements": requirements,
    }


def dump_json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=True, sort_keys=True) + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decisions", type=Path, default=DEFAULT_DECISIONS)
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--allow-empty", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    decision_rows = load_review_decisions(args.decisions)
    if not decision_rows and not args.allow_empty:
        raise SystemExit(
            f"FAIL: no reviewed decisions at {args.decisions}; Step 9 needs human Step 5 output"
        )
    cards = load_evidence_cards(args.cards)
    packet = build_requirements_packet(decision_rows, cards)
    output = dump_json(packet)
    if args.write:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
