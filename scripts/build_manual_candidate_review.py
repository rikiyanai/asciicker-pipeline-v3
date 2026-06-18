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


def _norm_label(card: dict) -> str:
    """Whitespace-normalized hand corrected_label — the cluster key for the reject
    batch. Cards the human gave the SAME label inherit the SAME proposal."""
    return " ".join(str((card.get("hand", {}) or {}).get("corrected_label", "") or "").split())


# --- Reject-batch verdicts, one per hand-label cluster ----------------------
# Each cluster is identified by a representative card_id (`rep`); every reject-class
# card in the same normalized-label group inherits the verdict. Role tokens are read
# from the human's own words (PLAYER->player/rider torso, HELMET->helmet, sword/shield
# overlays, BIG BEE->bee_body, ply die body->plydie_body). Uncertain hand prose
# ("maybe", "idk", "?") stays unresolved and out of the decisions file.
def _v(rep, roles, support, topology="", contradictions=None, supported=True, unresolved=False):
    return dict(rep=rep, roles=roles, support=support, topology=topology,
                contradictions=list(contradictions or []), supported=supported, unresolved=unresolved)


REJECT_CLUSTERS = [
    _v("bigbee-0000-L3", ["rider_torso"],
       "hand: limbless player torso for big bee mount, made to interchange with sword/shield",
       "bigbee L3 overlay; 3x3-grid player torso; no armour/helm/arms; rider slice for the bee mount"),
    _v("bigbee-0102-L2", ["bee_body"],
       "hand 'BIG BEE MOUNT' + engine L2 base accumulator (consistent with the wrong_guess_reject bigbee L2 set)",
       "bee as mount; base body layer", ["machine wolf/armor signature does not apply — this is a bee"]),
    _v("wolfie-0000-L3", ["rider_torso"],
       "hand: player body for mounted, the mounted overlay/underlay slice for offset",
       "wolfie L3 overlay; rider player body for the wolf mount"),
    _v("bigbee-1100-L5", ["helmet"], "hand 'HELMET'", "helmet overlay (bigbee/player)"),
    _v("bigbee-0101-L4", ["rider_torso", "sword"],
       "hand 'upper torso holding sword, one arm'", "bigbee L4 overlay; one arm; holding (not swinging) sword"),
    _v("player-1101-L4", ["helmet"], "hand 'helmet'", "player L4 helmet overlay"),
    _v("player-0102-L2", ["player_body"],
       "hand 'PLAYER NO ARMOUR NO HELMET / HAIR NO ARMS'", "player L2 base; no armour/helm/arms"),
    _v("plydie-0100-L2", ["plydie_body"], "hand 'ply die body'", "plydie L2 base body"),
    _v("plydie-1110-L3", ["helmet"],
       "hand uncertain: 'ply die helmet bit maybe or shoulder bit as said before'",
       "plydie L3 overlay; helmet-vs-shoulder ambiguous", supported=False, unresolved=True),
    _v("bigbee-0001-L4", ["rider_torso", "sword"],
       "hand 'PLAYER HOLDING SWORD (NOT SWINGING) ... NO LEGS, JUST UPPER TORSO ... FOR BIG BEE'",
       "bigbee L4 overlay; upper torso only, no legs, holding sword; rider slice"),
    _v("plydie-1010-L2", ["plydie_body", "shield"], "hand 'ply die with shield'", "plydie L2 base + shield"),
    _v("attack-0101-L2", ["player_body"],
       "hand 'ATACKING WITHOUT THE HELMET (NO HAIR EITHER)'", "attack-anim player body; no helmet/hair"),
    _v("attack-1101-L2", ["player_body"],
       "hand 'ATTACKING ANIM WITHOUT HELM/HAIR'", "attack-anim player body; no helm/hair"),
    _v("bigbee-0111-L6", ["helmet"], "hand 'HELMET BIT'", "bigbee L6 helmet overlay"),
    _v("attack-1111-L4", ["helmet"], "hand 'HELMET BIT FOR ATTACKING ANIM'", "attack L4 helmet overlay"),
    _v("attack-1101-L4", ["helmet"], "hand 'HELMET PART FOR ATTACKING ANIM'", "attack L4 helmet overlay"),
    _v("attack-0111-L3", ["helmet"], "hand 'HELMET PART ONLY'", "attack L3 helmet overlay"),
    _v("player-1100-L2", ["player_body"], "hand 'PLAYER NO ARMOUR NO HELMET / HAIR'", "player L2 base"),
    _v("player-0100-L2", ["player_body"],
       "hand 'PLAYER NO ARMOUR NO HELMET / HAIR missing one shoulder'", "player L2 base; missing one shoulder"),
    _v("bigbee-0102-L5", ["helmet"], "hand 'helmey' (typo for helmet)", "bigbee L5 helmet overlay"),
    _v("plydie-0012-L2", ["plydie_body", "shield"],
       "hand 'play die body with shield no hair/helm (guessing its in another layer)'",
       "plydie L2 base + shield; hair/helm placed in another layer per hand"),
    _v("player-0002-L2", ["player_body"],
       "hand 'player no armour no helmet one single arm missing hip region, idle walk anim'",
       "player L2 base; one arm, missing hip region; idle walk anim"),
    _v("player-nude-base-L2", ["player_body"], "hand 'player nude'", "player nude base; no equipment"),
    _v("plydie-0101-L2", ["plydie_body", "sword"], "hand 'ply die body with sword'", "plydie L2 base + sword"),
    _v("plydie-0101-L3", ["helmet"], "hand 'ply die helmet bit only'", "plydie L3 helmet overlay"),
    _v("plydie-1011-L2", ["sword", "shield"],
       "hand 'ply die sword and shield'",
       "plydie L2; hand labels equipment only",
       ["engine 'L2 base accumulator' vs hand equipment-only label — layer may carry equipment not body"]),
    _v("plydie-0010-L2", ["plydie_body", "shield"], "hand 'ply_die_body with shield'", "plydie L2 base + shield"),
    _v("plydie-0011-L2", ["plydie_body", "shield", "sword"],
       "hand 'ply_die_body with shield AND sword'", "plydie L2 base + shield + sword"),
    _v("plydie-1100-L3", ["helmet"], "hand 'plydie helm'", "plydie L3 helmet overlay"),
    _v("plydie-1101-L3", ["helmet"],
       "hand uncertain: 'plydie helmet bit only maybe idk ... it might be the shoulder bit only idk'",
       "plydie L3 overlay; helmet-vs-shoulder ambiguous", supported=False, unresolved=True),
    _v("plydie-1001-L3", ["sword"],
       "hand 'plydie sword bit only for colums 0-3 col 4 is player with sword no armour no helm'",
       "plydie L3 sword overlay; col 4 differs (player+sword) per hand"),
    _v("wolfie-0011-L5", ["sword"],
       "hand 'top partial sword bit only for wolfie (holding sword bit not attacking)'",
       "wolfie L5 sword overlay; holding, not attacking"),
    _v("wolfie-1011-L5", ["sword"],
       "hand 'top sword and shoulder? bit only for wolfie' (sword confident, shoulder uncertain)",
       "wolfie L5 sword overlay; possible shoulder bit (hand '?')"),
]


def merge_and_write_decisions(path, records: list[dict]) -> dict[str, dict]:
    """Upsert `records` into the decisions file, FAIL-CLOSED (FL-4162 Law 6).

    Loads existing rows first via decision_capture.load_decisions, which RAISES
    DecisionLoadError on a present-but-corrupt/unreadable file — the file is left
    untouched, never overwritten. Rows from earlier review batches that are not in
    this batch are PRESERVED; each reviewed source_key upserts in place (one row).
    Writes atomically. Returns the merged {source_key: record}.

    This is the canonical write path: it must not regress the Step 8 loader fix by
    blindly overwriting from only the current batch.
    """
    existing = dc.load_decisions(path)  # fail-closed on corrupt/unreadable present file
    for rec in records:
        existing[rec["source_key"]] = rec
    dc._atomic_write_jsonl(Path(path), [existing[k] for k in sorted(existing)])
    return existing


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
    cel = card.get("cells", {}) or {}
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
        # preserved glyph evidence — full records so the packet is self-contained
        "ahsw": card.get("ahsw"),
        "glyph_exact_matches": gly.get("exact_matches", []),
        "glyph_near_matches": gly.get("near_matches", []),  # full {cell_delta, key} records
        "glyph_similarity_scope": gly.get("scope"),
        # preserved cell evidence — visible glyphs + frame-0 cell positions
        "visible_glyph_set": cel.get("visible_glyph_set", []),
        "glyph_count": cel.get("glyph_count"),
        "atlas_visible_count": cel.get("atlas_visible_count"),
        "cell_positions": cel.get("cell_positions", []),
        "cell_positions_truncated": cel.get("cell_positions_truncated"),
        "frame_wh": cel.get("frame_wh"),
        "frame_scope": cel.get("frame_scope"),
        "whole_atlas_fingerprint": cel.get("whole_atlas_fingerprint"),
        # preserved engine facts
        "engine_fixed_role": eng.get("fixed_role"),
        "engine_is_overlay": eng.get("is_overlay"),
        "engine_overlay_ordinal": eng.get("overlay_ordinal"),
        "engine_swoosh_cyan_fg": eng.get("swoosh_cyan_fg_detected"),
        "engine_family_layer_count": eng.get("family_layer_count"),
    }


def main() -> int:
    cards = _load_cards()
    reviewed_ids: set[str] = set()
    packet_rows: list[dict] = []
    supported_records: list[dict] = []

    def apply_verdict(card: dict, verdict: dict) -> None:
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
        reviewed_ids.add(card["card_id"])
        if verdict["supported"] and not verdict["unresolved"]:
            supported_records.append(dc.build_decision_record(
                card, approved_role=";".join(roles), composite_roles=roles,
                provenance=REVIEW_PROVENANCE, topology_note=verdict["topology"],
                contradictions=verdict["contradictions"], reviewer_note=verdict["support"],
            ))

    # Batch 1 — card-keyed wrong_guess_reject verdicts.
    missing = [cid for cid in REVIEWED if cid not in cards]
    if missing:
        print(f"ERROR: reviewed card_ids absent from cards file: {missing}", file=sys.stderr)
        return 2
    for cid, verdict in REVIEWED.items():
        apply_verdict(cards[cid], verdict)

    # Batch 2 — reject-class cards, grouped by normalized hand label, one verdict
    # per cluster (identified by a representative card_id).
    missing_reps = [cl["rep"] for cl in REJECT_CLUSTERS if cl["rep"] not in cards]
    if missing_reps:
        print(f"ERROR: reject cluster reps absent from cards file: {missing_reps}", file=sys.stderr)
        return 2
    reject_cards = [c for c in cards.values()
                    if (c.get("review", {}) or {}).get("queue_class_name") == "reject"]
    rep_to_verdict = {cl["rep"]: cl for cl in REJECT_CLUSTERS}
    groups: dict[str, list] = {}
    for c in reject_cards:
        groups.setdefault(_norm_label(c), []).append(c)
    uncovered_reject: list[str] = []
    for _label, group in groups.items():
        ids = {c["card_id"] for c in group}
        cl = next((rep_to_verdict[r] for r in rep_to_verdict if r in ids), None)
        if cl is None:
            uncovered_reject.extend(sorted(ids))
            continue
        for c in group:
            apply_verdict(c, cl)

    packet_rows.sort(key=lambda r: (r["review_rank"] is None, r["review_rank"]))

    # Pending coverage (so we never imply more was reviewed than was).
    by_class: dict[str, list] = {}
    for cid, card in cards.items():
        qc = (card.get("review", {}) or {}).get("queue_class_name", "?")
        by_class.setdefault(qc, []).append(cid)
    pending = {
        qc: sorted(c for c in ids if c not in reviewed_ids)
        for qc, ids in sorted(by_class.items())
    }

    packet = {
        "schema": "manual_candidate_review/v1",
        "authority": False,
        "is_proposal": True,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "review_kind": "agent_manual_review_of_hand_corpus",
        "batch": "rejects-first: wrong_guess_reject + reject (mount families first)",
        "counts": {
            "reviewed": len(packet_rows),
            "supported_proposals": len(supported_records),
            "unresolved": sum(1 for r in packet_rows if r["agent_verdict"]["unresolved"]),
        },
        "uncovered_reject_card_ids": uncovered_reject,
        "pending_by_queue_class": {qc: len(ids) for qc, ids in pending.items()},
        "pending_card_ids": pending,
        "reviewed": packet_rows,
    }
    if uncovered_reject:
        print(f"WARNING: {len(uncovered_reject)} reject cards uncovered by any "
              f"cluster verdict: {uncovered_reject}", file=sys.stderr)
    PACKET.write_text(json.dumps(packet, indent=2, ensure_ascii=False), encoding="utf-8")

    # Upsert the supported reviewed rows into the decisions file, FAIL-CLOSED
    # (FL-4162 Law 6): preserves earlier-batch rows and refuses to overwrite a
    # corrupt/unreadable existing file. Must not regress the Step 8 loader fix.
    try:
        merged = merge_and_write_decisions(DECISIONS, supported_records)
    except dc.DecisionLoadError as exc:
        print(f"ABORT: existing decisions file is corrupt/unreadable — write blocked "
              f"(fail closed): {exc}", file=sys.stderr)
        return 3

    print(json.dumps({
        "reviewed": len(packet_rows),
        "supported_written_this_batch": len(supported_records),
        "decisions_total_rows": len(merged),
        "unresolved": packet["counts"]["unresolved"],
        "packet": str(PACKET.relative_to(REPO)),
        "decisions": str(DECISIONS.relative_to(REPO)),
        "all_proposal_only": all(r.get("authority") is False and r.get("is_proposal") is True
                                 for r in merged.values()),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
