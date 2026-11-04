#!/usr/bin/env python3
"""FINAL HERDR portraits: 16x16 pixel grids -> crisp SVGs with an automatic outline.
Run: python3 portraits.py  (writes ../portraits/<class>.svg)"""
import os

BASE = {
    "S": "#f2c29a", "s": "#c98a6a", "E": "#1a1030", "m": "#b0524a", "W": "#ffffff",
}
OUTLINE = "#140c28"

SPRITES = {
    "ingenieur": ({"H": "#5a3a22", "G": "#c9a227", "c": "#7fe0ff", "A": "#6b4a2e", "O": "#e0782a", "T": "#c0c4d0"}, [
        "................",
        ".....HHHHHH.....",
        "....HHHHHHHH....",
        "...HGGGGGGGGH...",
        "...HGcGHHGcGH...",
        "...HSSSSSSSSH...",
        "...SSESSSSESS...",
        "...SSESSSSESS...",
        "...sSSSSSSSSs...",
        "....SSSmmSSS....",
        ".....sSSSSs.....",
        "......SSSS......",
        "...AAAWAAWAAA...",
        "..AAAAWAAWAAAA..",
        ".AAOOOOOOOOOOAA.",
        ".AAOOOOTTOOOOAA.",
    ]),
    "archimage": ({"P": "#d97757", "y": "#ffd84a", "H": "#c8c8d8", "B": "#eeeef6", "R": "#8a3fb0"}, [
        ".......PP.......",
        "......PPPP......",
        ".....PPyPPP.....",
        "....PPPPPPPP....",
        "..PPPPPPPPPPPP..",
        "...HSSSSSSSSH...",
        "...SSESSSSESS...",
        "...SSSSSSSSSS...",
        "...BSSSSSSSSB...",
        "...BBBSmmSBBB...",
        "....BBBBBBBB....",
        ".....BBBBBB.....",
        "..RRRRBBBBRRRR..",
        ".RRRRRRBBRRRRRR.",
        ".RRRRRRyRRRRRRR.",
        ".RRRRRRRRRRRRRR.",
    ]),
    "alchimiste": ({"D": "#2f6b4a", "d": "#4f9a6a", "G": "#c9a227", "F": "#bfe8ff", "L": "#7be07b"}, [
        "................",
        ".....DDDDDD.....",
        "....DDDDDDDD....",
        "...DDdddddddD...",
        "...DdSSSSSSdD...",
        "...DSSSSSSSSD...",
        "...DSGGSSGGSD...",
        "...DSGEGGEGSD...",
        "...DSSSSSSSSD...",
        "...DDSSmmSSDD...",
        "....DDsSSsDD....",
        "...DDDDSSDDDD...",
        "..DDDDDDDDDDDD..",
        ".DDDDDDDDDFFDDD.",
        ".DDDDDDDDFLLFDD.",
        ".DDDDDDDDFLLFDD.",
    ]),
    "voleur": ({"n": "#c0392b", "H": "#2a2438", "N": "#2a2438", "V": "#5b3f8c", "x": "#d8dce8"}, [
        "................",
        "................",
        "....nnnnnnnn....",
        "...nnnnnnnnnnn..",
        "...nnnnnnnnnn.n.",
        "...HSSSSSSSSH...",
        "...NNENNNNENN...",
        "...SSSSSSSSSS...",
        "...SSSSSSSSSS...",
        "...NNNNNNNNNN...",
        "....NNNNNNNN....",
        "......NNNN......",
        "...VVVNNNNVVV...",
        "..VVVVVNNVVVVV..",
        ".VVVVVVxxVVVVVV.",
        ".VVVVVVVVVVVVVV.",
    ]),
    "barde": ({"f": "#ff6b6b", "b": "#3a6fd8", "H": "#e0a040", "G": "#2aa198", "g": "#2aa198", "L": "#a0622d"}, [
        "...........ff...",
        "..........ff....",
        "....bbbbbbbf....",
        "...bbbbbbbbbbb..",
        "...HHHHHHHHHH...",
        "...HSSSSSSSSH...",
        "...SSESSSSESS...",
        "...SSSSSSSSSS...",
        "...sSSSSSSSSs...",
        "....SSSmmSSS....",
        ".....sSSSSs.....",
        "......SSSS......",
        "...GGGWWWWGGG...",
        "..gggggWWgggLL..",
        ".gggggggggLLLLg.",
        ".ggggggggggLLgg.",
    ]),
    "villageois": ({"Y": "#e8c860", "H": "#7a5a3a", "T": "#8a7a5a"}, [
        "................",
        "................",
        ".....YYYYYY.....",
        "....YYYYYYYY....",
        "..YYYYYYYYYYYY..",
        "...HSSSSSSSSH...",
        "...SSESSSSESS...",
        "...SSSSSSSSSS...",
        "...sSSSSSSSSs...",
        "....SSSmmSSS....",
        ".....sSSSSs.....",
        "......SSSS......",
        "...TTTTTTTTTT...",
        "..TTTTTTTTTTTT..",
        ".TTTTTTTTTTTTTT.",
        ".TTTTTTTTTTTTTT.",
    ]),
}


def render(palette, rows):
    assert len(rows) == 16 and all(len(r) == 16 for r in rows), rows
    pal = {**BASE, **palette}
    n = 18  # one pixel of room for the outline on each side
    grid = [["."] * n for _ in range(n)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            grid[y + 1][x + 1] = ch
    rects = []
    for y in range(n):
        for x in range(n):
            ch = grid[y][x]
            if ch != ".":
                rects.append((x, y, pal[ch]))
            elif any(0 <= y + dy < n and 0 <= x + dx < n and grid[y + dy][x + dx] != "."
                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                rects.append((x, y, OUTLINE))
    body = "".join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{c}"/>' for x, y, c in rects)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" width="{n * 8}" height="{n * 8}" shape-rendering="crispEdges">{body}</svg>\n'


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "portraits")
    os.makedirs(out, exist_ok=True)
    for name, (palette, rows) in SPRITES.items():
        with open(os.path.join(out, f"{name}.svg"), "w") as f:
            f.write(render(palette, rows))
        print("wrote", name)
