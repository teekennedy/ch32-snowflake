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
uint32_t GetLEDRainbow(uint32_t ledno, uint32_t frame, uint32_t brightness);
uint32_t GetLEDTwinkle(uint32_t ledno, uint32_t frame, uint32_t brightness);

#endif
