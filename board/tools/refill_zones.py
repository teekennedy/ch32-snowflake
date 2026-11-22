"""Refill all zones in a board and save it in place.

make_panel.py runs this automatically. kicad-cli 9 has no zone-refill option,
and pcbnew is not on PyPI (so uv cannot provide it): run it with KiCad's
bundled Python, e.g. on macOS:

    /Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 \
        tools/refill_zones.py snowflake-panel.kicad_pcb
"""
import sys

import pcbnew

path = sys.argv[1]
board = pcbnew.LoadBoard(path)
pcbnew.ZONE_FILLER(board).Fill(board.Zones())
board.Save(path)
print(f"refilled {len(board.Zones())} zones in {path}")
