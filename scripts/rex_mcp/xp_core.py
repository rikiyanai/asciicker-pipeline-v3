"""
xp_core.py -- .xp binary format reader/writer for Asciicker sprites

ARCHITECTURE:
    Core I/O module for the .xp sprite format. Every pipeline output flows through
    this module. Handles gzip compression, column-major cell storage, and multi-layer
    sprite data.

    This module is the canonical Python implementation of the REXPaint .xp file format
    used throughout the Asciicker asset pipeline. It provides low-level load/save of
    gzip-compressed .xp files and metadata extraction from Layer 0 (the engine's
    sprite atlas control layer).

    XPFile and XPLayer are the two exported classes. Nearly every pipeline stage
    depends on them: assembler.py writes .xp via XPFile.save(), validator.py reads
    metadata via XPFile.get_metadata(), xp_tool.py renders layers for editing,
    and the MCP server (xp_mcp_server.py) bridges them to external tools.

    Binary format: gzip( version_i32 | layer_count_u32 | layers[] )
    Layer format:  width_i32 | height_i32 | cells[width][height]
    Cell format:   glyph_u32 | fg_r | fg_g | fg_b | bg_r | bg_g | bg_b (10 bytes)

    Storage order: Column-major (iterate x, then y) for REXPaint compatibility.

KEY EXPORTS:
    XPLayer -- Single layer: width, height, and a row-major 2D grid of (glyph, fg, bg).
    XPFile  -- Multi-layer container with load/save/get_metadata.
"""

import gzip
import struct
import io

from sprite_errors import SpriteValidationError

OVERLAY_KEY_RGB: tuple[int, int, int] = (1, 1, 1)
LEGACY_YELLOW_KEY_RGB: tuple[int, int, int] = (255, 255, 85)


def encode_digit(value: int) -> int:
    """Encode integer 0-35 as CP437 digit glyph ('0'-'9', 'A'-'Z')."""
    if 0 <= value <= 9:
        return ord("0") + value
    if 10 <= value <= 35:
        return ord("A") + (value - 10)
    raise ValueError(f"value out of encodable range [0,35]: {value}")


def rebase_visual_layer_transparency_keys(
    visual_layer: "XPLayer",
    source_key_layer: "XPLayer | None",
    output_key_layer: "XPLayer",
) -> None:
    """Translate transparency-key colors in a visual layer after L0 replacement."""
    yellow = LEGACY_YELLOW_KEY_RGB
    for y, row in enumerate(visual_layer.data):
        for x, cell in enumerate(row):
            source_key_rgb = None
            if (source_key_layer is not None
                    and y < source_key_layer.height and x < source_key_layer.width):
                source_key_rgb = tuple(source_key_layer.data[y][x][2])
            if y >= output_key_layer.height or x >= output_key_layer.width:
                continue
            output_key_rgb = tuple(output_key_layer.data[y][x][2])
            glyph, fg, bg = cell
            fg_rgb, bg_rgb = tuple(fg), tuple(bg)
            if source_key_rgb is not None and fg_rgb == source_key_rgb:
                fg_rgb = output_key_rgb
            if source_key_rgb is not None and bg_rgb == source_key_rgb:
                bg_rgb = output_key_rgb
            if fg_rgb == yellow:
                fg_rgb = output_key_rgb
            if bg_rgb == yellow:
                bg_rgb = output_key_rgb
            if fg_rgb != tuple(fg) or bg_rgb != tuple(bg):
                visual_layer.data[y][x] = (glyph, fg_rgb, bg_rgb)


class XPLayer:
    """A single layer of an .xp file: a 2D grid of (glyph, fg_rgb, bg_rgb) cells.

    The grid is stored row-major as data[y][x] for convenient Python indexing,
    even though the on-disk format is column-major. The load/save methods in
    XPFile handle the transposition transparently.

    Attributes:
        width:  Number of columns (cells).
        height: Number of rows (cells).
        data:   2D list, data[row][col] = (glyph, (fg_r, fg_g, fg_b), (bg_r, bg_g, bg_b)).
    """
    def __init__(self, width, height, data=None):
        self.width = width
        self.height = height
        if data:
            self.data = data
        else:
            self.data = [[(0, (0, 0, 0), (0, 0, 0)) for _ in range(width)] for _ in range(height)]


class XPFile:
    """Multi-layer .xp file container with load, save, and metadata extraction.

    The .xp format is REXPaint's native format: a gzip-compressed binary blob
    containing a version header, layer count, and per-layer cell grids stored
    in column-major order.

    Typical usage::

        # Read
        xp = XPFile("sprites/player-nude.xp")
        meta = xp.get_metadata()  # {'angles': 8, 'anims': [1, 8]}

        # Write
        xp = XPFile()
        xp.version = -1
        xp.layers.append(some_layer)
        xp.save("output.xp")

    Attributes:
        version: int32 format version (always -1 for current REXPaint).
        layers:  List[XPLayer] in stacking order (0 = bottom / metadata).
    """
    def __init__(self, filename=None):
        self.version = -1
        self.layers = []
        if filename:
            self.load(filename)

    def _validate_for_save(self, filename: str) -> None:
        """Validate XPFile structure before saving.

        Enforces XP_LAYER_SPEC requirements:
        - Minimum 3 layers (Layer 0=colorkey, Layer 1=height, Layer 2=visual)
        - All layers must have positive dimensions (width > 0, height > 0)
        - Glyph values must be in range 0-255

        Raises:
            SpriteValidationError: If validation fails
        """
        if len(self.layers) < 3:
            raise SpriteValidationError(
                filename,
                expected="minimum 3 layers",
                got=len(self.layers),
                message="insufficient layer count"
            )

        for layer_idx, layer in enumerate(self.layers):
            if layer.width <= 0 or layer.height <= 0:
                raise SpriteValidationError(
                    filename,
                    expected="width > 0 and height > 0",
                    got=f"{layer.width}x{layer.height}",
                    message=f"invalid dimensions at layer {layer_idx}"
                )

        for layer_idx, layer in enumerate(self.layers):
            for y in range(layer.height):
                for x in range(layer.width):
                    cell = layer.data[y][x]
                    if isinstance(cell, tuple) and len(cell) >= 1:
                        glyph = cell[0] if isinstance(cell[0], int) else 0
                    else:
                        glyph = 0

                    if not (0 <= glyph <= 255):
                        raise SpriteValidationError(
                            filename,
                            expected="glyph 0-255",
                            got=glyph,
                            message=f"invalid glyph at layer {layer_idx} cell ({x},{y})"
                        )

    def load(self, filename):
        """Load an .xp file from disk, decompressing and parsing all layers."""
        _MAX_DECOMPRESSED_BYTES = 500 * 1024 * 1024
        _MAX_LAYERS = 64
        _MAX_CELLS_PER_LAYER = 10_000_000

        print(f"Loading {filename}...")
        try:
            with gzip.open(filename, 'rb') as f:
                content = f.read(_MAX_DECOMPRESSED_BYTES + 1)
                if len(content) > _MAX_DECOMPRESSED_BYTES:
                    raise ValueError(
                        f"XP file exceeds {_MAX_DECOMPRESSED_BYTES // (1024*1024)}MB "
                        f"decompressed size limit: {filename}"
                    )

            offset = 0

            if len(content) < 8:
                raise ValueError(f"XP file too small ({len(content)} bytes): {filename}")

            version = struct.unpack('<i', content[offset:offset+4])[0]
            offset += 4
            self.version = version

            layer_count = struct.unpack('<I', content[offset:offset+4])[0]
            offset += 4

            if layer_count > _MAX_LAYERS:
                raise ValueError(
                    f"XP file claims {layer_count} layers (max {_MAX_LAYERS}): {filename}"
                )
            self.layers = []

            for _ in range(layer_count):
                if offset + 8 > len(content):
                    raise ValueError(f"XP file truncated at layer header: {filename}")
                width = struct.unpack('<i', content[offset:offset+4])[0]
                offset += 4
                height = struct.unpack('<i', content[offset:offset+4])[0]
                offset += 4

                if width <= 0 or height <= 0:
                    raise ValueError(
                        f"Invalid layer dimensions {width}x{height}: {filename}"
                    )
                if width * height > _MAX_CELLS_PER_LAYER:
                    raise ValueError(
                        f"Layer {width}x{height} = {width*height} cells "
                        f"exceeds limit of {_MAX_CELLS_PER_LAYER}: {filename}"
                    )
                expected_bytes = width * height * 10
                if offset + expected_bytes > len(content):
                    raise ValueError(
                        f"XP file truncated: layer needs {expected_bytes} bytes "
                        f"but only {len(content) - offset} remain: {filename}"
                    )

                layer_data = [[None for _ in range(width)] for _ in range(height)]

                for x in range(width):
                    for y in range(height):
                        glyph = struct.unpack('<I', content[offset:offset+4])[0]
                        offset += 4
                        fg_r = content[offset]
                        fg_g = content[offset+1]
                        fg_b = content[offset+2]
                        offset += 3
                        bg_r = content[offset]
                        bg_g = content[offset+1]
                        bg_b = content[offset+2]
                        offset += 3

                        layer_data[y][x] = (glyph, (fg_r, fg_g, fg_b), (bg_r, bg_g, bg_b))

                self.layers.append(XPLayer(width, height, layer_data))

            print(f"Loaded {len(self.layers)} layers.")

        except Exception as e:
            print(f"Failed to load {filename}: {e}")
            raise

    def save(self, filename):
        """Save all layers to a gzip-compressed .xp file."""
        print(f"Saving to {filename}...")
        self._validate_for_save(filename)
        try:
            out_buffer = io.BytesIO()

            out_buffer.write(struct.pack('<i', self.version))
            out_buffer.write(struct.pack('<I', len(self.layers)))

            for layer in self.layers:
                out_buffer.write(struct.pack('<ii', layer.width, layer.height))

                for x in range(layer.width):
                    for y in range(layer.height):
                        glyph, fg, bg = layer.data[y][x]
                        out_buffer.write(struct.pack('<I', glyph))
                        out_buffer.write(bytes(fg))
                        out_buffer.write(bytes(bg))

            with gzip.open(filename, 'wb') as f:
                f.write(out_buffer.getvalue())

        except Exception as e:
            print(f"Failed to save {filename}: {e}")
            raise

    def get_metadata(self):
        """Extract sprite atlas metadata from Layer 0.

        Metadata cell positions (row-major data[y][x] coordinates):
            data[0][0]   -> angle count (number of viewing directions)
            data[0][1..] -> animation frame counts (scanned until non-digit or zero)

        Returns:
            dict with keys:
                'angles': int -- Number of view angles (1 if not encoded or <= 0).
                'projs':  int -- Projection count (2 for multi-angle, 1 otherwise).
                'anims':  list[int] -- Frame count per animation sequence.
            Returns None if the file has no layers.
        """
        if not self.layers:
            return None

        l0 = self.layers[0]

        def get_digit(res):
            glyph, _, _ = res
            if 48 <= glyph <= 57:
                return glyph - 48
            if 65 <= glyph <= 90:
                return glyph + 10 - 65
            if 97 <= glyph <= 122:
                return glyph + 10 - 97
            return -1

        raw_angles = get_digit(l0.data[0][0])

        if raw_angles > 0:
            projs = 2
            angles = raw_angles
        else:
            projs = 1
            angles = 1

        anims = []
        for a in range(1, l0.width):
            length = get_digit(l0.data[0][a])
            if length > 0:
                anims.append(length)
            else:
                break

        return {
            "angles": angles,
            "projs": projs,
            "anims": anims
        }
