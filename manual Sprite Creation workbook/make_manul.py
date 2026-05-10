#!/usr/bin/env python3
"""Author manul (Pallas's cat) XP sprite for Asciicker pipeline-v3.

Atlas: 80×48 cells, 4 layers
4 angles (N/E/S/W), 2 anims (idle=1fr, walk=4fr), frame=8×12
"""
import gzip, struct

# ── Palette ───────────────────────────────────────────────────────────────────
TRANS = (255, 0, 255)   # REXPaint magenta = transparency key
BK = (0, 0, 0)
DG = (85, 85, 85)       # dark gray  — outlines, dorsal marks
LG = (170, 170, 170)    # light gray — main body fur
CR = (170, 170, 85)     # cream      — face, belly, pale markings
AM = (170, 85, 0)       # amber      — nose, inner ear

# ── Cell definitions  (glyph, fg, bg) ────────────────────────────────────────
TP = (0,   BK, TRANS)   # transparent
OL = (47,  DG, TRANS)   # / left diagonal
OR = (92,  DG, TRANS)   # \ right diagonal
OV = (124, DG, TRANS)   # | vertical
Sl = (176, LG, CR)      # ░ light fur on cream  (face / belly)
Sm = (177, DG, LG)      # ▒ mid  fur on light gray (body)
Sd = (178, BK, DG)      # ▓ dark mark on dark gray (paws / tail tip)
EA = (44,  DG, LG)      # , ear tip  (comma glyph)
EY = (250, BK, CR)      # · eye dot
WH = (126, DG, CR)      # ~ whisker line
NO = (176, AM, CR)      # ░ amber-on-cream  (nose bridge)

# ── Atlas geometry ────────────────────────────────────────────────────────────
FW, FH     = 8, 12          # frame width × height in cells
ANGLES     = 4              # 0=N, 1=E, 2=S, 3=W
ANIM_LEN   = [1, 4]         # anim0=idle(1 frame), anim1=walk(4 frames)
PROJS      = 2              # two projection halves (angles > 1)
TOTAL_FR   = sum(ANIM_LEN)  # 5
W = PROJS * TOTAL_FR * FW   # 80
H = ANGLES * FH             # 48

# ── Frame data (12 rows × 8 cols) ────────────────────────────────────────────

def hflip(frame):
    return [list(reversed(row)) for row in frame]

# ── North (rear view) ─────────────────────────────────────────────────────────
N_BASE = [
    # R0  ears wide-set (manul: small, low, wide ears)
    [TP, TP, EA, Sl, Sl, EA, TP, TP],
    # R1  head top curve
    [TP, OL, Sl, Sl, Sl, Sl, OR, TP],
    # R2  widest head point — manul head is HUGE relative to body
    [OL, Sl, Sl, Sm, Sm, Sl, Sl, OR],
    # R3  nape reverse-curve (head = same width as shoulders)
    [OR, Sl, Sm, Sm, Sm, Sm, Sl, OL],
    # R4  shoulder stripe
    [OV, Sm, Sl, Sl, Sl, Sl, Sm, OV],
    # R5  upper back
    [TP, OV, Sm, Sl, Sl, Sm, OV, TP],
    # R6  mid-back dorsal stripe (dark centre, lighter sides)
    [TP, OV, Sl, Sm, Sm, Sl, OV, TP],
    # R7  lower back tapering
    [TP, OR, Sl, Sl, Sl, Sl, OL, TP],
    # R8  rump narrowing
    [TP, TP, OR, Sl, Sl, OL, TP, TP],
    # R9-R11  blunt tail (manul tail is thick and short)
    [TP, TP, TP, OV, OV, TP, TP, TP],
    [TP, TP, TP, OV, OV, TP, TP, TP],
    [TP, TP, TP, Sd, Sd, TP, TP, TP],  # banded tip
]

# ── South (front view) ───────────────────────────────────────────────────────
S_BASE = [
    # R0  head top (manul head very round)
    [TP, OL, Sl, Sl, Sl, Sl, OR, TP],
    # R1  head sides
    [OL, Sl, Sl, Sl, Sl, Sl, Sl, OR],
    # R2  face (very flat — manul characteristic)
    [OV, Sl, Sl, Sl, Sl, Sl, Sl, OV],
    # R3  eyes (wide apart)
    [OV, Sl, EY, Sl, Sl, EY, Sl, OV],
    # R4  whisker bar
    [OV, Sl, WH, WH, WH, WH, Sl, OV],
    # R5  muzzle + nose
    [OL, Sl, NO, Sl, Sl, NO, Sl, OR],
    # R6  chin / neck
    [TP, OR, Sl, Sl, Sl, Sl, OL, TP],
    # R7  upper body (narrower than head)
    [TP, TP, OV, Sm, Sm, OV, TP, TP],
    # R8  body
    [TP, TP, OV, Sm, Sm, OV, TP, TP],
    # R9  lower body
    [TP, TP, OV, Sm, Sm, OV, TP, TP],
    # R10 legs
    [TP, OV, OV, TP, TP, OV, OV, TP],
    # R11 paws
    [TP, Sd, Sd, TP, TP, Sd, Sd, TP],
]

# ── East body rows (same across all walk frames) ──────────────────────────────
E_BODY = [
    # R0  single ear visible (manul ear: small, wide-set)
    [TP, EA, Sl, EA, TP, TP, TP, TP],
    # R1  head top
    [OL, Sl, Sl, Sl, OR, TP, TP, TP],
    # R2  face — very round, eye visible
    [OV, Sl, EY, Sl, Sl, OR, TP, TP],
    # R3  whisker / muzzle area
    [OV, Sl, WH, Sm, Sl, Sl, OR, TP],
    # R4  neck-to-body join (stocky, no taper)
    [OR, Sm, Sl, Sl, Sm, Sm, Sl, OR],
    # R5  body (dorsal ridge = col 5)
    [TP, OR, Sl, Sl, Sl, Sm, Sl, OV],
    # R6  body
    [TP, OR, Sl, Sl, Sl, Sm, Sl, OV],
    # R7  lower body
    [TP, TP, OR, Sl, Sl, Sm, Sl, OL],
    # R8  belly line between legs
    [TP, TP, Sl, Sl, Sl, Sl, TP, TP],
]

# Leg rows for east walk frames:
LEGS_NEUTRAL = [
    [TP, OV, OV, TP, TP, OV, OV, TP],
    [TP, OV, OV, TP, TP, OV, OV, TP],
    [TP, Sd, Sd, TP, TP, Sd, Sd, TP],
]
LEGS_FRONT_UP = [          # near-front leg raised
    [TP, TP, OV, TP, TP, OV, OV, TP],
    [TP, TP, OV, TP, TP, OV, OV, TP],
    [TP, TP, Sd, TP, TP, Sd, Sd, TP],
]
LEGS_BACK_UP = [           # near-back leg raised
    [TP, OV, OV, TP, TP, OV, TP, TP],
    [TP, OV, OV, TP, TP, OV, TP, TP],
    [TP, Sd, Sd, TP, TP, Sd, TP, TP],
]

E_IDLE  = E_BODY + LEGS_NEUTRAL    # idle = neutral stance
E_WALK0 = E_BODY + LEGS_NEUTRAL    # mid-stride 0
E_WALK1 = E_BODY + LEGS_FRONT_UP   # front leg up
E_WALK2 = E_BODY + LEGS_NEUTRAL    # mid-stride 1
E_WALK3 = E_BODY + LEGS_BACK_UP    # back leg up

# West = mirror of east
W_IDLE  = hflip(E_IDLE)
W_WALK0 = hflip(E_WALK0)
W_WALK1 = hflip(E_WALK1)
W_WALK2 = hflip(E_WALK2)
W_WALK3 = hflip(E_WALK3)

# ── Atlas builder ─────────────────────────────────────────────────────────────

def make_empty():
    return [[TP]*W for _ in range(H)]

def place(grid, frame, angle_idx, proj_idx, frame_seq_idx):
    col0 = (proj_idx * TOTAL_FR + frame_seq_idx) * FW
    row0 = angle_idx * FH
    for r in range(FH):
        for c in range(FW):
            grid[row0 + r][col0 + c] = frame[r][c]

def build_visual():
    g = make_empty()
    # angle→ list of [idle, walk0, walk1, walk2, walk3]
    by_angle = {
        0: [N_BASE,  N_BASE,  N_BASE,  N_BASE,  N_BASE ],
        1: [E_IDLE,  E_WALK0, E_WALK1, E_WALK2, E_WALK3],
        2: [S_BASE,  S_BASE,  S_BASE,  S_BASE,  S_BASE ],
        3: [W_IDLE,  W_WALK0, W_WALK1, W_WALK2, W_WALK3],
    }
    for ang, frames in by_angle.items():
        for fi, fr in enumerate(frames):
            place(g, fr, ang, 0, fi)   # proj 0
            place(g, fr, ang, 1, fi)   # proj 1 (copy for now)
    return g

def build_meta():
    """Layer 0: color key (all bg=TRANS) + metadata digits."""
    g = make_empty()
    # [x=0, y=0] = angle count '4'
    g[0][0]  = (52, BK, TRANS)   # '4'
    # [x=FH*1, y=0] = anim0 frame count '1'
    g[0][FH] = (49, BK, TRANS)   # '1'
    # [x=FH*2, y=0] = anim1 frame count '4'
    g[0][FH*2] = (52, BK, TRANS) # '4'
    return g

def build_height():
    """Layer 1: all '0' (ground level)."""
    return [[(48, BK, TRANS)]*W for _ in range(H)]  # '0' everywhere

def build_swoosh():
    return make_empty()  # all transparent

# ── XP serialiser ─────────────────────────────────────────────────────────────

def pack_layer(grid):
    data = bytearray()
    data += struct.pack('<ii', W, H)
    for x in range(W):
        for y in range(H):
            glyph, fg, bg = grid[y][x]
            data += struct.pack('<I', glyph)
            data += bytes(fg)
            data += bytes(bg)
    return bytes(data)

layers = [
    pack_layer(build_meta()),
    pack_layer(build_height()),
    pack_layer(build_visual()),
    pack_layer(build_swoosh()),
]

raw = bytearray()
raw += struct.pack('<i', -1)          # version
raw += struct.pack('<I', 4)           # num_layers
for l in layers:
    raw += l

out = '/tmp/manul.xp'
with open(out, 'wb') as f:
    f.write(gzip.compress(bytes(raw)))

print(f"Written {out}  ({len(gzip.compress(bytes(raw)))} bytes)")
