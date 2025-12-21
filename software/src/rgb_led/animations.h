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

// led_fn_t for rainbow animation
uint32_t GetLEDRainbow(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDTwinkleIce(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDTwinkleRedGreen(uint32_t ledno, uint32_t frame, uint8_t brightness);
uint32_t GetLEDShootingStar(uint32_t ledno, uint32_t frame, uint8_t brightness);

#endif
