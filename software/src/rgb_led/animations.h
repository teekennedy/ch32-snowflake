#ifndef _ANIMATIONS_H
#define _ANIMATIONS_H

#include "funconfig.h"

#ifndef BYTES_PER_LED
#define BYTES_PER_LED 3
#endif

#define BITS_PER_LED BYTES_PER_LED * 8

#ifndef NUM_LEDS
#error NUM_LEDS undefined
#endif

#include <stdint.h>

uint32_t GetLEDRainbow(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDChristmasLights(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDTwinkleIce(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDTwinkleRedGreen(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDShootingStar(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDShuffleOn(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDShuffleOff(uint32_t ledno, uint32_t frame, uint8_t brightness);

// GetLEDAllOff turns off all LEDs for a "null" animation.
// Useful to test the power draw of non-LED components.
uint32_t GetLEDAllOff(uint32_t ledno, uint32_t frame, uint8_t brightness);


#endif
