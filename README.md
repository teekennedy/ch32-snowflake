# CH32 Snowflake

![preview](./images/preview.png)

A holiday snowflake with RGB LEDs, driven by the infamous CH32V003 microcontroller.

This is my first ever PCB design, and I borrowed heavily from [ch32-fireplace](https://github.com/johanwheeler/ch32-fireplace/tree/main) for snippets of schematic and code.

## PCB Shape

The snowflake shape was designed in OpenSCAD using the [BOSL2 library](https://github.com/BelfrySCAD/BOSL2).
If you want to view or make changes to the shape, I highly recommend installing the nightly version of openSCAD.

## KiCad Project

The KiCad project was designed with help from the [jlcpcb-tools plugin](https://github.com/Bouni/kicad-jlcpcb-tools).
If you plan to send this board to JLCPCB, be sure to import [corrections.csv](./board/jlcpcb/corrections.csv) before generating your pick and place file.
It has corrections for both the CH32V003 (90 degrees CCW rotation) and the TPS61002 boost converter (which is offset from where it should be).

I did my best to choose Basic parts where possible, to help keep the cost of the economic PCB assembly down.
Then I went with an ENIG coating and couldn't use economic PCBA anyway. Oh well.

## Panel (Edge Rails)

[snowflake-panel.kicad_pcb](./board/snowflake-panel.kicad_pcb) panelizes the snowflake PCB with breakaway edge rails.
It's generated using [make_panel.py](./board/tools/make_panel.py), which takes [snowflake.kicad_pcb](./board/snowflake.kicad_pcb) as input.
Re-run the script to update the panel after changing the board:

```sh
cd board
uv run tools/make_panel.py   # or just ./tools/make_panel.py
```

The script declares its dependencies inline, so [uv](https://docs.astral.sh/uv/) installs them on the fly.
It then refills the copper zones using KiCad's bundled Python, found at the default macOS install path (set `KICAD_PYTHON` to point elsewhere).

How the panel is built:

- Start with a rectangle that is as tall and wide as the snowflake and add 5 mm rails on the left and right. Take the edge cut of the snowflake, grow the outline by 2 mm, then subtract it from the rectangle.
- Add 12 tabs to connect the edge rail sections to the panel with mouse bites.
  The tabs meet the snowflake at similar angles for easier removal.
- The mouse-bite holes sit just outside the snowflake's edge so that after removal they can be filed flush for a flawless finish.
- JLCPCB tooling holes and fiducials in the rail corners.
  Everything the script adds is excluded from the BOM and pick-and-place files, so those don't change.

Generate the fabrication files from the panel, and choose "Panel by Customer" when ordering.

## Silkscreen Art (Silk Router 30°)

[board/tools/silk-router](./board/tools/silk-router/index.html) is a small browser tool for drawing trace-style silkscreen art that snaps to 30° angles (KiCad's router only does 45°).
It loads the `.kicad_pcb` as a background and treats the board edge, holes, exposed pads and existing silkscreen as obstacles for walk-around routing.

```sh
cd board
python3 -m http.server 8000   # then open http://localhost:8000/tools/silk-router/
```

Serving it this way auto-loads `snowflake.kicad_pcb`. Opening `index.html` directly also works; use "Load board…" in that case.
Export either:

- **SVG**: coordinates are in board millimetres. In KiCad use File → Import → Graphics, pick F.SilkS and place it at X 0, Y 0.
- **.kicad_mod**: a footprint whose origin is the symmetry center (150, 150 by default). Place it at that position with rotation 0.

## Firmware

In order to flash the firmware, you need to setup your build environment for [ch32fun](https://github.com/cnlohr/ch32fun).
See [their installation wiki](https://github.com/cnlohr/ch32fun/wiki/Installation) for instructions.

Next, build the `minichlink` utility.
Ensure the ch32fun submodule is initialized `git submodule update --init`.
Then, from the software/ch32fun/minichlink directory, run `make`.
If you have your RISC-V toolchain installed properly, it should build.

Now you can go to the software/src directory and run `make` to compile and flash the binary.
