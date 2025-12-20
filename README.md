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

## Firmware

In order to flash the firmware, you need to setup your build environment for [ch32fun](https://github.com/cnlohr/ch32fun).
See [their installation wiki](https://github.com/cnlohr/ch32fun/wiki/Installation) for instructions.

Next, build the `minichlink` utility.
Ensure the ch32fun submodule is initialized `git submodule update --init`.
Then, from the software/ch32fun/minichlink directory, run `make`.
If you have your RISC-V toolchain installed properly, it should build.

Now you can go to the software/src directory and run `make` to compile and flash the binary.
