# Repository Guidelines

## Project Structure & Module Organization
The `software/` tree holds all firmware: `src/` contains `main.c`, `funconfig.h`, and the `rgb_led/` driver where new animations should live; `ch32fun/` is the upstream submodule that provides startup code and flash utilities. PCB sources live in `snowflake/` (KiCad project, gerbers, fabrication notes) while laser-cut assets and silkscreen artwork sit in `graphics/`. Mechanical experiments in `holiday-snowflake.scad` and the DXF exports are used to keep the board shape in sync with hardware drawings.

## Build, Flash, and Development Commands
- `git submodule update --init` ensures `software/ch32fun` matches the version expected by `software/src/Makefile`.
- `cd software/ch32fun/minichlink && make` builds the flashing tool once per host; rerun after pulling upstream changes.
- `cd software/src && make` compiles and immediately runs the `flash` target via `minichlink`, generating `main.{elf,bin,hex}`.
- `cd software/src && make clean` removes intermediates when switching toolchains or debugging stale artifacts.

## Coding Style & Naming Conventions
Firmware is plain C with tabs for indentation, K&R braces on functions (`int main()` in `software/src/main.c`), and uppercase macros for hardware constants (`PORT_RGB`, `NUM_LEDS`). Keep new driver APIs CamelCase to match `RGBInit` and `GetLEDRainbow`, but favor snake_case for local helpers. Store lookup tables as `static const` arrays near their use, and document timing-sensitive sections with short comments. Update `funconfig.h` instead of scattering board-specific tweaks across multiple files.

## Testing & Hardware Verification
No automated unit tests run in CI, so rely on bench checks. After `make`, confirm `main.elf` size with `riscv64-unknown-elf-size main.elf` and flash via `make` while the CH32V003 is connected through SWIO. Monitor the UART log (115200 baud) for the `Frame: <n>` heartbeat and visually verify all 24 LEDs advance through the expected pattern; note any stuck pixels in the PR description. When adjusting KiCad files, regenerate `snowflake/snowflake-gerbers.zip` and inspect in a viewer before ordering boards.

## Commit & Pull Request Guidelines
Follow the existing short, command-style subjects seen in `git log` (e.g., "Get CH32V003 working"). Write commits that separate firmware, CAD, and graphic updates so reviewers can test independently. Each PR should summarize functional impact, list the exact command sequence used to build/flash or regenerate gerbers, attach screenshots of the PCB diff if visuals changed, and link to any tracking issue. Mention required hardware (power supply, probe wiring) so other contributors can reproduce results.
