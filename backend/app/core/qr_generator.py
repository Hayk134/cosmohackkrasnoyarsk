"""backend/app/core/qr_generator.py

Pure-Python Standalone Vector SVG QR Code Engine.
Implements ISO/IEC 18004 byte mode encoding, Galois Field GF(256) Reed-Solomon
error correction, alignment pattern layout, and vector SVG output.
Zero external library dependencies required.
"""

from __future__ import annotations

import base64
from typing import List, Optional, Tuple


# ---------------------------------------------------------------------------
# Galois Field GF(256) Arithmetic (Primitive polynomial 0x11D = 285)
# ---------------------------------------------------------------------------
GF_EXP = [0] * 512
GF_LOG = [0] * 256

def _init_gf() -> None:
    x = 1
    for i in range(255):
        GF_EXP[i] = x
        GF_EXP[i + 255] = x
        GF_LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D

_init_gf()


def gf_mul(x: int, y: int) -> int:
    if x == 0 or y == 0:
        return 0
    return GF_EXP[(GF_LOG[x] + GF_LOG[y]) % 255]


def rs_generator_poly(nsym: int) -> List[int]:
    """Generates Reed-Solomon generator polynomial for nsym error correction symbols."""
    g = [1]
    for i in range(nsym):
        root = GF_EXP[i]
        new_g = [0] * (len(g) + 1)
        for j in range(len(g)):
            new_g[j] ^= gf_mul(g[j], root)
            new_g[j + 1] ^= g[j]
        g = new_g
    return g


def rs_encode(msg: List[int], nsym: int) -> List[int]:
    """Calculates Reed-Solomon error correction codewords for a message."""
    gen = rs_generator_poly(nsym)
    msg_poly = list(msg) + [0] * nsym
    gen_rev = list(reversed(gen))
    for i in range(len(msg)):
        coef = msg_poly[i]
        if coef != 0:
            for j in range(1, len(gen_rev)):
                msg_poly[i + j] ^= gf_mul(gen_rev[j], coef)
    return msg_poly[len(msg):]


# ---------------------------------------------------------------------------
# QR Code Version Parameters (Versions 1 to 10, EC Level L and M)
# Format: (total_codewords, data_codewords_L, ec_codewords_L, num_blocks_L, data_codewords_M, ec_codewords_M, num_blocks_M)
# ---------------------------------------------------------------------------
QR_SPECS = {
    1:  (26,  19,  7,  1, 16,  10, 1),
    2:  (44,  34,  10, 1, 28,  16, 1),
    3:  (70,  55,  15, 1, 44,  26, 1),
    4:  (100, 80,  20, 1, 64,  18, 2),
    5:  (134, 108, 26, 1, 86,  24, 2),
    6:  (172, 136, 18, 2, 108, 16, 4),
    7:  (196, 156, 20, 2, 124, 18, 4),
    8:  (242, 194, 24, 2, 154, 22, 4),
    9:  (292, 232, 30, 2, 182, 22, 5),
    10: (346, 274, 18, 4, 216, 26, 5),
}

ALIGNMENT_POSITIONS = {
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
}

# 15-bit format info strings (Level L: mask 0..7) with BCH error correction and XOR mask 0x5412
FORMAT_INFO_L = {
    0: 0x77C4, 1: 0x72F3, 2: 0x7DAA, 3: 0x789D,
    4: 0x662F, 5: 0x6318, 6: 0x6C41, 7: 0x6976,
}


def _select_version(data_len: int) -> int:
    """Finds minimal QR version for byte mode with Level L error correction."""
    for ver in range(1, 11):
        spec = QR_SPECS[ver]
        cap = spec[1]  # data codewords Level L
        # Byte mode header: 4 bits mode + 8 bits (ver 1-9) or 16 bits (ver 10) count
        hdr_bits = 12 if ver < 10 else 20
        needed_bytes = (hdr_bits + data_len * 8 + 7) // 8
        if needed_bytes <= cap:
            return ver
    return 10


def _encode_data(data: bytes, version: int) -> List[int]:
    """Encodes byte payload into padded data codewords."""
    spec = QR_SPECS[version]
    total_data_bytes = spec[1]

    # Bitstream construction
    bits: List[int] = []

    def append_bits(val: int, count: int) -> None:
        for i in range(count - 1, -1, -1):
            bits.append((val >> i) & 1)

    # 1. Byte mode indicator: 0100
    append_bits(0b0100, 4)

    # 2. Character count indicator
    count_bits = 8 if version < 10 else 16
    append_bits(len(data), count_bits)

    # 3. Data payload bytes
    for b in data:
        append_bits(b, 8)

    # 4. Terminator (up to 4 zeroes)
    max_bits = total_data_bytes * 8
    term_len = min(4, max_bits - len(bits))
    append_bits(0, term_len)

    # 5. Pad to multiple of 8 bits
    while len(bits) % 8 != 0 and len(bits) < max_bits:
        bits.append(0)

    # 6. Convert to byte array
    codewords: List[int] = []
    for i in range(0, len(bits), 8):
        byte_val = 0
        for bit in bits[i:i + 8]:
            byte_val = (byte_val << 1) | bit
        codewords.append(byte_val)

    # 7. Add alternating pad bytes (0xEC, 0x11)
    pad_bytes = [0xEC, 0x11]
    pad_idx = 0
    while len(codewords) < total_data_bytes:
        codewords.append(pad_bytes[pad_idx % 2])
        pad_idx += 1

    return codewords


def generate_qr_matrix(text: str) -> Tuple[List[List[int]], int]:
    """Encodes text string into a 2D binary matrix (1 for black, 0 for white)."""
    raw_data = text.encode("utf-8")
    version = _select_version(len(raw_data))
    size = 17 + 4 * version

    # Initialize grid: None = unallocated, 0 = white, 1 = black
    matrix: List[List[Optional[int]]] = [[None for _ in range(size)] for _ in range(size)]
    reserved: List[List[bool]] = [[False for _ in range(size)] for _ in range(size)]

    def set_module(r: int, c: int, val: int, is_res: bool = True) -> None:
        if 0 <= r < size and 0 <= c < size:
            matrix[r][c] = val
            if is_res:
                reserved[r][c] = True

    # 1. Place Finder Patterns (7x7 with 1-module separator)
    finder_locs = [(0, 0), (0, size - 7), (size - 7, 0)]
    for fr, fc in finder_locs:
        for r in range(-1, 8):
            for c in range(-1, 8):
                gr, gc = fr + r, fc + c
                if 0 <= gr < size and 0 <= gc < size:
                    if 0 <= r <= 6 and 0 <= c <= 6:
                        if r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4):
                            set_module(gr, gc, 1)
                        else:
                            set_module(gr, gc, 0)
                    else:
                        set_module(gr, gc, 0)  # Separator

    # 2. Place Timing Patterns
    for i in range(8, size - 8):
        val = 1 if i % 2 == 0 else 0
        if not reserved[6][i]:
            set_module(6, i, val)
        if not reserved[i][6]:
            set_module(i, 6, val)

    # 3. Place Alignment Patterns (Version >= 2)
    if version >= 2:
        coords = ALIGNMENT_POSITIONS.get(version, [])
        for ar in coords:
            for ac in coords:
                # Skip finders
                if (ar <= 8 and ac <= 8) or (ar <= 8 and ac >= size - 8) or (ar >= size - 8 and ac <= 8):
                    continue
                for dr in range(-2, 3):
                    for dc in range(-2, 3):
                        val = 1 if (abs(dr) == 2 or abs(dc) == 2 or (dr == 0 and dc == 0)) else 0
                        set_module(ar + dr, ac + dc, val)

    # 4. Dark Module
    set_module(size - 8, 8, 1)

    # 5. Reserve Format Info Areas
    for c in range(9):
        if not reserved[8][c]:
            reserved[8][c] = True
    for r in range(9):
        if not reserved[r][8]:
            reserved[r][8] = True
    for c in range(size - 8, size):
        reserved[8][c] = True
    for r in range(size - 7, size):
        reserved[r][8] = True

    # 6. Prepare Data and Error Correction Codewords
    data_codewords = _encode_data(raw_data, version)
    spec = QR_SPECS[version]
    num_blocks = spec[3]
    ec_per_block = spec[2]

    # Split into blocks and calculate RS ECC
    data_blocks: List[List[int]] = []
    ec_blocks: List[List[int]] = []
    base_len = len(data_codewords) // num_blocks

    for b in range(num_blocks):
        block = data_codewords[b * base_len:(b + 1) * base_len]
        data_blocks.append(block)
        ec_blocks.append(rs_encode(block, ec_per_block))

    # Interleave data codewords, then ec codewords
    final_codewords: List[int] = []
    max_dlen = max(len(b) for b in data_blocks)
    for i in range(max_dlen):
        for block in data_blocks:
            if i < len(block):
                final_codewords.append(block[i])
    for i in range(ec_per_block):
        for block in ec_blocks:
            final_codewords.append(block[i])

    # Convert all codewords to bit sequence
    final_bits: List[int] = []
    for cw in final_codewords:
        for shift in range(7, -1, -1):
            final_bits.append((cw >> shift) & 1)

    # 7. Zig-Zag Matrix Bit Placement (columns 2 at a time, right to left)
    bit_idx = 0
    total_bits = len(final_bits)
    col = size - 1
    while col > 0:
        if col == 6:
            col -= 1  # Skip vertical timing pattern column

        rows = range(size - 1, -1, -1) if ((col + 1) // 2) % 2 == 1 else range(size)
        for r in rows:
            for c in (col, col - 1):
                if not reserved[r][c]:
                    bit = final_bits[bit_idx] if bit_idx < total_bits else 0
                    # Apply Mask 0: (r + c) % 2 == 0
                    if (r + c) % 2 == 0:
                        bit ^= 1
                    matrix[r][c] = bit
                    bit_idx += 1
        col -= 2

    # 8. Write 15-bit Format String (Mask 0, Level L)
    fmt = FORMAT_INFO_L[0]
    fmt_bits = [(fmt >> i) & 1 for i in range(14, -1, -1)]

    # Around Top-Left Finder
    format_top_coords = [
        (8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5), (8, 7), (8, 8),
        (7, 8), (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8),
    ]
    for idx, (r, c) in enumerate(format_top_coords):
        matrix[r][c] = fmt_bits[idx]

    # Around Bottom-Left & Top-Right Finders
    format_split_coords = [
        (size - 1, 8), (size - 2, 8), (size - 3, 8), (size - 4, 8),
        (size - 5, 8), (size - 6, 8), (size - 7, 8),
        (8, size - 8), (8, size - 7), (8, size - 6), (8, size - 5),
        (8, size - 4), (8, size - 3), (8, size - 2), (8, size - 1),
    ]
    for idx, (r, c) in enumerate(format_split_coords):
        matrix[r][c] = fmt_bits[idx]

    # Final matrix of 0s and 1s
    res_matrix: List[List[int]] = [
        [matrix[r][c] if matrix[r][c] is not None else 0 for c in range(size)]
        for r in range(size)
    ]
    return res_matrix, size


def generate_qr_svg(
    text: str,
    foreground: str = "#059669",
    background: str = "#ffffff",
    quiet_zone: int = 4,
    size_px: int = 256,
) -> str:
    """Generates an institutional vector SVG string representation of a QR code.

    Args:
        text: Payload text to encode (e.g. verification URL).
        foreground: Hex color for dark modules (default emerald-600: #059669).
        background: Hex color for light modules (default white: #ffffff).
        quiet_zone: Number of modules for quiet border (default 4).
        size_px: Default rendered pixel dimension.

    Returns:
        Scalable vector XML SVG string.
    """
    matrix, n = generate_qr_matrix(text)
    total_dim = n + 2 * quiet_zone

    # Collect black module coordinates into compact SVG path data
    path_commands: List[str] = []
    for r in range(n):
        for c in range(n):
            if matrix[r][c] == 1:
                x = c + quiet_zone
                y = r + quiet_zone
                path_commands.append(f"M{x},{y}h1v1h-1z")

    path_data = "".join(path_commands)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {total_dim} {total_dim}" '
        f'width="{size_px}" height="{size_px}" '
        f'shape-rendering="crispEdges">\n'
        f'  <rect width="100%" height="100%" fill="{background}"/>\n'
        f'  <path d="{path_data}" fill="{foreground}"/>\n'
        f'</svg>'
    )
    return svg


def generate_qr_svg_base64(text: str, foreground: str = "#059669") -> str:
    """Returns SVG encoded as a data:image/svg+xml;base64 URI."""
    svg = generate_qr_svg(text, foreground=foreground)
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"
