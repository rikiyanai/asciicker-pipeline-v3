#!/usr/bin/env python3
"""FL-4162 — agent manual review of the existing hand corpus -> proposal surface.

This is NOT relabeling. The human judgment already exists in the state_FINAL hand
corpus (status / corrected_label / note / pre_source / pre_guess), preserved card
by card in layer_evidence_cards.jsonl. This tool performs *agent manual review* of
that corpus: for each reviewed card it reads the hand label together with the glyph
exact/near evidence and the engine composition facts, and turns the hand verdict
into a deliberate, structured PROPOSAL — while marking contradictions and
unresolved topology instead of forcing a clean role.

Output is two artifacts, both proposal-only (authority:false):

  1. manual_candidate_review.json        readable review packet (ALL reviewed cards
                                          + every preserved evidence field + the
                                          agent verdict + a pending-by-class index)
  2. source_layer_review_decisions.jsonl  only the SUPPORTED reviewed rows, written
                                          through decision_capture (authority:false,
                                          fingerprint-pinned, fail-closed loader)

Discipline (do not regress):
  - The proposal's authority is the HAND LABEL, never glyph co-occurrence. Role
    tokens are read from the human's own words; they are never inferred from a
    glyph pattern (that is the classifier trap this lane exists to avoid).
  - A card is written to the decisions file ONLY when supported=True and
    unresolved=False. Uncertain hand prose ("maybe", "idk", "?") stays in the
    packet as unresolved and is NOT promoted to a decision.
  - Nothing here mutates state_FINAL or the evidence cards, and nothing claims
    compiler / semantic-map authority. That gate is later (Step 10).

Rejects-first: this first batch reviews the 20 wrong_guess_reject rows (the rows
where a wrong machine guess was overridden by hand), starting with the mount
families. Remaining queue classes (reject / partial / *_accept) are listed as
pending in the packet so coverage is never silently overclaimed.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SEMANTIC = REPO / "docs/research/ascii/semantic_maps"
CARDS = SEMANTIC / "layer_evidence_cards.jsonl"
PACKET = SEMANTIC / "manual_candidate_review.json"
DECISIONS = SEMANTIC / "source_layer_review_decisions.jsonl"

sys.path.insert(0, str(Path(__file__).resolve().parent))
import decision_capture as dc  # noqa: E402

REVIEW_PROVENANCE = {
    "tool": "build_manual_candidate_review",
    "review_kind": "agent_manual_review_of_hand_corpus",
    "recorded_at": "2026-06-18",
    "batch": "rejects-first/wrong_guess_reject",
}

# --- Agent reviewed verdicts, keyed by card_id ------------------------------
# Each verdict was made by reading THIS card's hand prose + glyph exact/near +
# engine facts. `roles` are read from the human's words. `supported` gates the
# decisions file; `unresolved` keeps a card out of it when the hand is uncertain.
_BEE = dict(
    roles=["bee_body"],
    contradictions=[
        "pre_guess 'armor;mount_body_wolf' (GLYPH_SIGNATURE) contradicted by hand: "
        "bigbee is a bee, not a wolf-mount/armor layer"
    ],
    support="engine 'L2 base accumulator' + 24-way byte-exact identity across all bigbee L2 + emphatic hand BEE label",
    topology="",
    supported=True,
    unresolved=False,
)
_WOLACK_ATK = dict(
    roles=["mount_body_wolf", "rider_torso", "sword"],
    contradictions=[
        "pre_guess 'armor;mount_body_wolf' partially wrong — hand explicitly states NO armour, NO helm"
    ],
    support="confident hand prose 'wolf body top part with player with sword attacking no armour no helm' (no uncertainty markers); overlay ord 1",
    topology="attack pose per hand 'attacking'; overlay composite layer",
    supported=True,
    unresolved=False,
)

REVIEWED: dict[str, dict] = {
    # bigbee L2 base — bee body (wrong wolf/armor guess overridden by hand)
    "bigbee-0000-L2": _BEE, "bigbee-0001-L2": _BEE, "bigbee-0002-L2": _BEE,
    "bigbee-0010-L2": _BEE, "bigbee-0011-L2": _BEE, "bigbee-0012-L2": _BEE,
    "bigbee-0100-L2": _BEE, "bigbee-0101-L2": _BEE,
    # bigbee L5 overlay — uncertain (anim?) -> NOT forced
    "bigbee-0012-L5": dict(
        roles=["crossbow", "rider_torso"],
        contradictions=["pre_guess 'shield' contradicted by hand 'crossbow plus torso'"],
        support="overlay ord 3; near=7, no exact",
        topology="hand 'PARTIAL CROSSBOW PLUS TORSO , MAYBE FOR ANIM?' — possible anim-frame variant",
        supported=False,
        unresolved=True,
    ),
    # wolack L3 overlay — wolf+rider+sword attack composite
    "wolack-0111-L3": _WOLACK_ATK, "wolack-1001-L3": _WOLACK_ATK,
    "wolack-1011-L3": _WOLACK_ATK, "wolack-1101-L3": _WOLACK_ATK,
    "wolack-1111-L3": _WOLACK_ATK,
    # wolfie L2 base — wolf body, partly composite
    "wolfie-0012-L2": dict(
        roles=["mount_body_wolf"],
        contradictions=["pre_guess 'armor;mount_body_wolf' — mount_body_wolf correct, armor wrong (hand 'wolf body only')"],
        support="hand 'wolf body only' + engine 'L2 base accumulator'",
        topology="hand uncertain whether ears present/missing — detail only, core role unaffected",
        supported=True, unresolved=False,
    ),
    "wolfie-0102-L2": dict(
        roles=["mount_body_wolf", "rider_torso"],
        contradictions=["pre_guess 'armor;mount_body_wolf' — armor negated by hand 'no armour helm arms'"],
        support="hand 'wolf top part with player torso (no armour helm arms)'",
        topology="no armour/helm/arms per hand",
        supported=True, unresolved=False,
    ),
    "wolfie-1001-L2": dict(
        roles=["mount_body_wolf", "rider_torso", "sword"],
        contradictions=["pre_guess 'armor;mount_body_wolf' — armor wrong (hand has no armour, adds sword)"],
        support="hand 'wolf torso with player torso holding sword'",
        topology="rider holding sword",
        supported=True, unresolved=False,
    ),
    # player L2 base — player body + shield
    "player-0012-L2": dict(
        roles=["player_body", "shield"],
        contradictions=["pre_guess 'shield' incomplete — hand 'player with shield no armour helmet'"],
        support="hand 'player with shield no armour helmet' + engine 'L2 base accumulator'",
        topology="hand notes missing one arm, self-described as a guess cross-referencing a crossbow layer — arm detail uncertain, core player+shield confident",
        supported=True, unresolved=False,
    ),
    # plydie L3 overlays
    "plydie-0011-L3": dict(
        roles=["shield", "sword"],
        contradictions=["pre_guess 'shield' incomplete — hand adds sword"],
        support="hand 'plydie with shield and sword reflection only'; overlay ord 1",
        topology="hand 'reflection only' — reflection-projection layer, not a base body",
        supported=True, unresolved=False,
    ),
    "plydie-0102-L3": dict(
        roles=["helmet"],
        contradictions=[],  # pre_guess 'plydie_helmet_regular' AGREES with hand — no contradiction
        support="hand 'helmet bit only' agrees with pre_guess (HINT_FROM_USER_BYTE_IDENTICAL) + 4-way exact across plydie L3",
        topology="overlay ord 1",
        supported=True, unresolved=False,
    ),
}


def _load_cards() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for line in CARDS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        out[rec["card_id"]] = rec
    return out


def _preserved(card: dict) -> dict:
    hand = card.get("hand", {}) or {}
    eng = card.get("engine", {}) or {}
    gly = card.get("glyph_similarity", {}) or {}
    return {
        "card_id": card.get("card_id"),
        "source_key": card.get("source_key"),
        "family": card.get("family"),
        "raw_layer_index": card.get("raw_layer_index"),
        "source_xp_path": card.get("source_xp_path"),
        "review_rank": (card.get("review", {}) or {}).get("review_rank"),
        "queue_class": (card.get("review", {}) or {}).get("queue_class_name"),
        # preserved hand corpus (verbatim)
        "hand_status": hand.get("status"),
        "hand_corrected_label": hand.get("corrected_label"),
        "hand_note": hand.get("note"),
        "hand_pre_source": hand.get("pre_source"),
        "hand_pre_guess": hand.get("pre_guess"),
        # preserved evidence
        "ahsw": card.get("ahsw"),
        "glyph_exact_matches": gly.get("exact_matches", []),
        "glyph_near_match_count": len(gly.get("near_matches", []) or []),
        "engine_fixed_role": eng.get("fixed_role"),
        "engine_is_overlay": eng.get("is_overlay"),
        "engine_overlay_ordinal": eng.get("overlay_ordinal"),
        "engine_swoosh_cyan_fg": eng.get("swoosh_cyan_fg_detected"),
        "engine_family_layer_count": eng.get("family_layer_count"),
    }


def main() -> int:
    cards = _load_cards()
    missing = [cid for cid in REVIEWED if cid not in cards]
    if missing:
        print(f"ERROR: reviewed card_ids absent from cards file: {missing}", file=sys.stderr)
        return 2

    packet_rows = []
    supported_records = []
    for cid, verdict in REVIEWED.items():
        card = cards[cid]
        roles = list(verdict["roles"])
        row = _preserved(card)
        row["agent_verdict"] = {
            "proposed_roles": roles,
            "supported": bool(verdict["supported"]),
            "unresolved": bool(verdict["unresolved"]),
            "support_basis": verdict["support"],
            "contradictions": list(verdict["contradictions"]),
            "topology_note": verdict["topology"],
        }
        packet_rows.append(row)
        if verdict["supported"] and not verdict["unresolved"]:
            rec = dc.build_decision_record(
                card,
                approved_role=";".join(roles),
                composite_roles=roles,
                provenance=REVIEW_PROVENANCE,
                topology_note=verdict["topology"],
                contradictions=verdict["contradictions"],
                reviewer_note=verdict["support"],
            )
            supported_records.append(rec)

    packet_rows.sort(key=lambda r: (r["review_rank"] is None, r["review_rank"]))

    # Pending coverage (so we never imply more was reviewed than was).
    by_class: dict[str, list] = {}
    for cid, card in cards.items():
        qc = (card.get("review", {}) or {}).get("queue_class_name", "?")
        by_class.setdefault(qc, []).append(cid)
    pending = {
        qc: sorted(c for c in ids if c not in REVIEWED)
        for qc, ids in sorted(by_class.items())
    }

    packet = {
        "schema": "manual_candidate_review/v1",
        "authority": False,
        "is_proposal": True,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "review_kind": "agent_manual_review_of_hand_corpus",
        "batch": "rejects-first / wrong_guess_reject (mount families first)",
        "counts": {
            "reviewed": len(packet_rows),
            "supported_proposals": len(supported_records),
            "unresolved": sum(1 for r in packet_rows if r["agent_verdict"]["unresolved"]),
        },
        "pending_by_queue_class": {qc: len(ids) for qc, ids in pending.items()},
        "pending_card_ids": pending,
        "reviewed": packet_rows,
    }
    PACKET.write_text(json.dumps(packet, indent=2, ensure_ascii=False), encoding="utf-8")

    # Write decisions file fresh from the supported reviewed rows (authority:false).
    ordered = {r["source_key"]: r for r in supported_records}
    dc._atomic_write_jsonl(DECISIONS, [ordered[k] for k in sorted(ordered)])

    print(json.dumps({
        "reviewed": len(packet_rows),
        "supported_written": len(ordered),
        "unresolved": packet["counts"]["unresolved"],
        "packet": str(PACKET.relative_to(REPO)),
        "decisions": str(DECISIONS.relative_to(REPO)),
        "all_proposal_only": all(r.get("authority") is False and r.get("is_proposal") is True
                                 for r in supported_records),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
