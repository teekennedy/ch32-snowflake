# CH32 Snowflake

![preview](./images/preview.png)

A holiday snowflake with RGB LEDs, driven by the infamous CH32V003 microcontroller.

This is my first ever PCB design, and I borrowed heavily from [ch32-fireplace](https://github.com/johanwheeler/ch32-fireplace/tree/main) for snippets of schematic and code.

## PCB Shape

The snowflake shape was designed in OpenSCAD using the [BOSL2 library](https://github.com/BelfrySCAD/BOSL2).
If you want to view or make changes to the shape, I highly recommend installing the nightly version of openSCAD.

## Firmware

In order to flash the firmware, you need to setup your build environment for [ch32fun](https://github.com/cnlohr/ch32fun).
See [their installation wiki](https://github.com/cnlohr/ch32fun/wiki/Installation) for instructions.

Next, build the `minichlink` utility.
Ensure the ch32fun submodule is initialized `git submodule update --init`.
Then, from the software/ch32fun/minichlink directory, run `make`.
If you have your RISC-V toolchain installed properly, it should build.

Now you can go to the software/src directory and run `make` to compile and flash the binary.
