#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = ["shapely>=2.0"]
# ///
"""Generate snowflake-panel.kicad_pcb: the snowflake set into solid breakaway rails.

The source board (snowflake.kicad_pcb) is never modified. This script copies it
and replaces its Edge.Cuts outline with a panel built by subtraction:

    rails = rectangle - (snowflake outline grown by GAP)
    panel = rails + snowflake + tabs

The rectangle adds RAIL mm on the left and right and nothing on top or bottom,
so the grown top and bottom tips cut through it and the rails come out as two
separate pieces (the layout JLCPCB uses for this board). Rails cover every
part of the panel more than GAP from the snowflake, so the panel is close to
solid and stays flat. Mouse-bite tabs bridge the gap at the points in TABS.
JLCPCB tooling holes and fiducials sit in the rail corners.

Re-run after any change to the source board:

    uv run tools/make_panel.py           # or ./tools/make_panel.py

Afterwards the zones are refilled with tools/refill_zones.py, which needs
KiCad's own Python (for pcbnew). It is found at the default macOS install path,
or set KICAD_PYTHON to its interpreter; without it the refill is skipped.
"""
import math
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

from shapely.geometry import MultiLineString, Point, Polygon, box
from shapely import set_precision
from shapely.ops import linemerge, unary_union

HERE = Path(__file__).resolve().parent.parent
SRC = HERE / "snowflake.kicad_pcb"
DST = HERE / "snowflake-panel.kicad_pcb"

GAP = 2.0          # routed gap around the snowflake (>= JLC 1.6 mm router bit)
MIN_WEB = 2.0      # rail slivers narrower than this between arms are dropped
RAIL = 5.0         # side rail width beyond the snowflake + gap (JLC SMT min 5 mm)
TAB_W = 5.0        # tab width
BITE_DRILL = 0.5   # mouse-bite hole diameter (JLC min NPTH 0.5 mm)
BITE_PITCH = 0.8   # centre-to-centre spacing
BITE_CLEAR = 0.1   # gap between each hole and the board edge: the holes never
                   # cut into the snowflake, so after snapping only small nubs
                   # stand proud of the edge and filing them restores the outline
TOOLING_D = 1.152  # JLC tooling hole
EDGE_W = 0.1


def die(msg):
    sys.exit(f"make_panel: {msg}")


def uid():
    return str(uuid.uuid4())


# --- read source outline ----------------------------------------------------

src = SRC.read_text()
edge_re = re.compile(r"\n\t\(gr_(?:line|arc|poly|rect|circle)\n(?:\t\t.*\n)*?\t\t\(layer \"Edge\.Cuts\"\)\n(?:\t\t.*\n)*?\t\)")
edges = edge_re.findall(src)
if not edges or any(not e.lstrip("\n\t").startswith("(gr_line") for e in edges):
    die("expected Edge.Cuts made only of gr_line segments")

segs = []
for e in edges:
    a = tuple(map(float, re.search(r"\(start ([-\d.]+) ([-\d.]+)\)", e).groups()))
    b = tuple(map(float, re.search(r"\(end ([-\d.]+) ([-\d.]+)\)", e).groups()))
    segs.append((a, b))
merged = linemerge(MultiLineString(segs))
loops = list(getattr(merged, "geoms", [merged]))
if len(loops) != 1 or not loops[0].is_closed:
    die(f"expected one closed outline, got {len(loops)} pieces")
snow = Polygon(loops[0].coords)
if not snow.is_valid:
    die("source outline is not a valid polygon")

x0, y0, x1, y1 = snow.bounds
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
ox0, ox1 = x0 - GAP - RAIL, x1 + GAP + RAIL   # panel outline; top/bottom flush with tips
oy0, oy1 = y0, y1

rails = box(ox0, oy0, ox1, oy1).difference(snow.buffer(GAP))
# morphological opening: drop thin fingers of rail left between close arms
rails = rails.buffer(-MIN_WEB / 2).buffer(MIN_WEB / 2).intersection(box(ox0, oy0, ox1, oy1))
# keep only pieces that reach the panel edge; islands left in the notches
# between arms would just fall out when the gap is routed
outline = box(ox0, oy0, ox1, oy1).exterior
rail_parts = [g for g in getattr(rails, "geoms", [rails]) if g.intersects(outline)]
rails = unary_union(rail_parts)
if any(r.interiors for r in rail_parts):
    die("a rail piece has holes; keepout zones assume simple polygons")

# --- tabs -----------------------------------------------------------------------
# (x, y) is a point on (or near) the snowflake edge. The tab runs outward along
# the edge normal there, or along `angle` (degrees, Y down) when given, which
# is needed where the tab straddles a pointed tip. Each entry is mirrored
# left/right and top/bottom about the board centre where `mirror` says so.
TABS = [
    # sides of the top/bottom diamonds (clear of H1 and the tip LEDs)
    ("diamond", 146.0, 81.0, None, "xy"),
    # outward straight edge of each diagonal arrowhead, clear of the point
    ("diagonal", 88.0, 118.5, None, "xy"),
    # near-vertical outward side of the four short spikes that point up/down
    # at 60 degrees: close to parallel with the tabs above, so each rail snaps
    # off with a similar bending motion. The channel between each spike and
    # the next arm only leaves a 2 mm rail web, so the tab sits near the
    # spike tip, where the channel opens into the main rail.
    ("short-spike", 126.23, 113.7, None, "xy"),
]


def outward_normal(p):
    """Unit normal of the outline segment nearest p, pointing out of the board."""
    ring = snow.exterior
    d = ring.project(p)
    a, b = ring.interpolate(max(d - 0.05, 0)), ring.interpolate(min(d + 0.05, ring.length))
    tx, ty = b.x - a.x, b.y - a.y
    n = math.hypot(tx, ty)
    nx, ny = -ty / n, tx / n
    if snow.contains(Point(p.x + nx * 0.2, p.y + ny * 0.2)):
        nx, ny = -nx, -ny
    return nx, ny


def tab_strip(x, y, angle):
    if angle is None:
        p = snow.exterior.interpolate(snow.exterior.project(Point(x, y)))
        nx, ny = outward_normal(p)
    else:
        p = Point(x, y)
        nx, ny = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    tx, ty = -ny, nx
    # from inside the board (deep enough to cover a V tip) to well into the rail
    L0, L1 = -TAB_W, GAP + 2.0
    hw = TAB_W / 2
    return Polygon([
        (p.x + nx * L0 + tx * hw, p.y + ny * L0 + ty * hw),
        (p.x + nx * L1 + tx * hw, p.y + ny * L1 + ty * hw),
        (p.x + nx * L1 - tx * hw, p.y + ny * L1 - ty * hw),
        (p.x + nx * L0 - tx * hw, p.y + ny * L0 - ty * hw),
    ])


tabs = {}
for name, x, y, angle, mirror in TABS:
    variants = [(name, x, y, angle)]
    if "x" in mirror:
        variants += [(f"{n}-R", 2 * cx - vx, vy, None if a is None else 180 - a) for n, vx, vy, a in variants]
    if "y" in mirror:
        variants += [(f"{n}-B", vx, 2 * cy - vy, None if a is None else -a) for n, vx, vy, a in variants]
    for n, vx, vy, a in variants:
        piece = tab_strip(vx, vy, a).difference(snow)
        parts = [g for g in getattr(piece, "geoms", [piece]) if g.intersects(rails)]
        if len(parts) != 1:
            die(f"tab {n}: expected one piece bridging to the rails, got {len(parts)}")
        tabs[n] = parts[0]

# snap to 0.1 um (the source outline uses 4 decimals) so float noise where a
# tab meets the outline cannot leave a self-intersecting Edge.Cuts
panel = set_precision(unary_union([rails, snow, *tabs.values()]), 1e-4)
if panel.geom_type != "Polygon":
    die("panel is not one connected piece: " + "; ".join(f"{g.area:.1f}mm2 @ {tuple(round(v,1) for v in g.bounds)}" for g in panel.geoms))

# --- mouse bites -------------------------------------------------------------------
# bite holes sit on the outline grown by one hole radius + BITE_CLEAR, i.e.
# entirely in the tab, just outside the board edge
bite_path = snow.buffer(BITE_DRILL / 2 + BITE_CLEAR, join_style="mitre")


def place_bites(line):
    """Holes along `line`, symmetric about its midpoint, never closer than
    BITE_PITCH in a straight line (matters at the V-shaped tips)."""
    step = 0.01
    mid = line.length / 2
    pts = [line.interpolate(mid)]
    for direction in (1, -1):
        last, d = pts[0], mid
        while 0 <= d + direction * step <= line.length:
            d += direction * step
            p = line.interpolate(d)
            if p.distance(last) >= BITE_PITCH:
                pts.append(p)
                last = p
    return [(round(p.x, 4), round(p.y, 4)) for p in pts]


bites = {}
for name, tab in tabs.items():
    line = bite_path.exterior.intersection(tab)
    line = linemerge(line) if line.geom_type == "MultiLineString" else line
    if line.geom_type != "LineString":
        die(f"tab {name}: bite line is not continuous ({line.geom_type})")
    bites[name] = place_bites(line)

# --- emit s-expressions ------------------------------------------------------------


def fmt(v):
    return f"{v:.6f}".rstrip("0").rstrip(".")


def gr_lines(ring):
    out = []
    c = list(ring.coords)
    for a, b in zip(c, c[1:]):
        out.append(
            f'\t(gr_line\n\t\t(start {fmt(a[0])} {fmt(a[1])})\n\t\t(end {fmt(b[0])} {fmt(b[1])})\n'
            f'\t\t(stroke\n\t\t\t(width {EDGE_W})\n\t\t\t(type default)\n\t\t)\n'
            f'\t\t(locked yes)\n\t\t(layer "Edge.Cuts")\n\t\t(uuid "{uid()}")\n\t)\n'
        )
    return out


def prop(name, value, hide=True, layer="F.Fab"):
    return (
        f'\t\t(property "{name}" "{value}"\n\t\t\t(at 0 0 0)\n\t\t\t(layer "{layer}")\n'
        + ("\t\t\t(hide yes)\n" if hide else "")
        + f'\t\t\t(uuid "{uid()}")\n\t\t\t(effects\n\t\t\t\t(font\n\t\t\t\t\t(size 1 1)\n'
        f"\t\t\t\t\t(thickness 0.15)\n\t\t\t\t)\n\t\t\t)\n\t\t)\n"
    )


def footprint(lib_id, ref, value, at, body, attr):
    return (
        f'\t(footprint "{lib_id}"\n\t\t(locked yes)\n\t\t(layer "F.Cu")\n\t\t(uuid "{uid()}")\n'
        f"\t\t(at {fmt(at[0])} {fmt(at[1])})\n"
        f'\t\t(descr "Panel frame feature, generated by tools/make_panel.py")\n'
        + prop("Reference", ref)
        + prop("Value", value)
        + prop("Datasheet", "")
        + prop("Description", "")
        + f"\t\t(attr {attr} board_only exclude_from_pos_files exclude_from_bom)\n"
        + body
        + "\t\t(embedded_fonts no)\n\t)\n"
    )


def npth(x, y, d):
    # mask layers only, no copper: as a no-net copper item inside the exposed
    # copper rim along the board edge (F/B.Mask strokes) it trips mask-bridge DRC
    return (
        f'\t\t(pad "" np_thru_hole circle\n\t\t\t(at {fmt(x)} {fmt(y)})\n\t\t\t(size {d} {d})\n'
        f'\t\t\t(drill {d})\n\t\t\t(layers "*.Mask")\n\t\t\t(uuid "{uid()}")\n\t\t)\n'
    )


def keepout(poly, name):
    pts = " ".join(f"(xy {fmt(x)} {fmt(y)})" for x, y in list(poly.exterior.coords)[:-1])
    return (
        f'\t(zone\n\t\t(net 0)\n\t\t(net_name "")\n\t\t(layers "F.Cu" "B.Cu")\n\t\t(uuid "{uid()}")\n'
        f'\t\t(name "{name}")\n\t\t(hatch edge 0.5)\n\t\t(connect_pads\n\t\t\t(clearance 0)\n\t\t)\n'
        f"\t\t(min_thickness 0.25)\n\t\t(filled_areas_thickness no)\n"
        f"\t\t(keepout\n\t\t\t(tracks not_allowed)\n\t\t\t(vias not_allowed)\n\t\t\t(pads allowed)\n"
        f"\t\t\t(copperpour not_allowed)\n\t\t\t(footprints allowed)\n\t\t)\n"
        f"\t\t(placement\n\t\t\t(enabled no)\n\t\t\t(sheetname \"\")\n\t\t)\n"
        f"\t\t(fill\n\t\t\t(thermal_gap 0.5)\n\t\t\t(thermal_bridge_width 0.5)\n\t\t)\n"
        f"\t\t(polygon\n\t\t\t(pts\n\t\t\t\t{pts}\n\t\t\t)\n\t\t)\n\t)\n"
    )


items = []
for ring in [panel.exterior, *panel.interiors]:
    items += gr_lines(ring)

for i, (name, pts) in enumerate(bites.items(), 1):
    ax = sum(p[0] for p in pts) / len(pts)
    ay = sum(p[1] for p in pts) / len(pts)
    body = "".join(npth(x - ax, y - ay, BITE_DRILL) for x, y in pts)
    items.append(footprint("panel:MouseBites", f"MB{i}", f"Mouse bites ({name})", (ax, ay), body, "through_hole"))

# tooling holes in the four corners, fiducials in three (JLC / KiKit convention)
def on_rail(x, y, r):
    if not rails.contains(Point(x, y).buffer(r + 0.5)):
        die(f"panel feature at ({x:.2f}, {y:.2f}) is not fully on a rail")
    return x, y


for i, (x, y) in enumerate([(ox0 + 2.5, oy0 + 2.5), (ox1 - 2.5, oy0 + 2.5),
                            (ox0 + 2.5, oy1 - 2.5), (ox1 - 2.5, oy1 - 2.5)], 1):
    items.append(footprint("panel:ToolingHole_1.152mm", f"TH{i}", "Tooling hole",
                           on_rail(x, y, TOOLING_D / 2), npth(0, 0, TOOLING_D), "through_hole"))
for i, (x, y) in enumerate([(ox0 + 2.5, oy0 + 10), (ox1 - 2.5, oy0 + 10), (ox0 + 2.5, oy1 - 10)], 1):
    body = (
        f'\t\t(pad "" smd circle\n\t\t\t(at 0 0)\n\t\t\t(size 1 1)\n\t\t\t(layers "F.Cu" "F.Mask")\n'
        f'\t\t\t(solder_mask_margin 0.5)\n\t\t\t(clearance 0.5)\n\t\t\t(uuid "{uid()}")\n\t\t)\n'
    )
    items.append(footprint("panel:Fiducial_1mm_Mask2mm", f"FID{i}", "Fiducial",
                           on_rail(x, y, 1.0), body, "smd"))

# keep the GND pour (drawn 50..250 mm) out of the rails and tabs on refill
for i, part in enumerate(rail_parts, 1):
    items.append(keepout(part.simplify(0.01), f"panel-rail-{i}"))
for name, tab in tabs.items():
    items.append(keepout(tab.buffer(0.01, join_style="mitre").simplify(0.001), f"panel-tab-{name}"))

out = edge_re.sub("", src)
out = out.rstrip()
if not out.endswith(")"):
    die("unexpected end of source file")
out = out[:-1] + "".join(items) + ")\n"
DST.write_text(out)

print(f"panel {ox1 - ox0:.2f} x {oy1 - oy0:.2f} mm, {len(rail_parts)} rail pieces, {len(tabs)} tabs, "
      f"{sum(len(p) for p in bites.values())} bite holes -> {DST.name}")
for name, pts in bites.items():
    print(f"  {name:16s} {len(pts):2d} holes, tab {tabs[name].bounds}")

# --- refill zones with KiCad's Python (pcbnew is not on PyPI) ----------------------
kicad_python = os.environ.get(
    "KICAD_PYTHON",
    "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3",
)
sys.stdout.flush()
if Path(kicad_python).is_file():
    subprocess.run([kicad_python, str(Path(__file__).with_name("refill_zones.py")), str(DST)],
                   check=True, stderr=subprocess.DEVNULL)
else:
    print("KiCad Python not found (set KICAD_PYTHON): zones NOT refilled; "
          "refill in pcbnew (B) before generating fabrication files")
