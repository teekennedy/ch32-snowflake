/*
   RGB LED driver.
	 The timings are specifically for the TZ-5050S2, a generic alternative of the WS2812B.
*/

#ifndef _TZ_5050S2__SIMPLE
#define _TZ_5050S2__SIMPLE

#include "ch32fun.h"

// Function to get the color of the given ledno
typedef uint32_t (*led_fn_t)(uint32_t ledno, uint32_t frame);

// Current animation frame
extern uint32_t frame;

// Pointer to the led function for the current animation
extern led_fn_t ledFunc;

void RGBInit(int gpio_pin, GPIO_TypeDef * const gpio_port);

void RGBSend(GPIO_TypeDef * port, int pin, uint8_t * data, int data_len, int start_offset, int bytes_to_send);

#endif
