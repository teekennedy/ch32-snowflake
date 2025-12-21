#include "tz_5050s2_driver.h"
#include "animations.h"
#include "funconfig.h"
#include <stdio.h>

#define PIN_RGB_NUM (PIN_RGB & 0xf)
#define BYTES_PER_LED 3
#define BITS_PER_LED BYTES_PER_LED * 8

void RGBInit(int pin)
{
	funPinMode(pin, GPIO_CFGLR_OUT_10Mhz_PP); // Set PIN_RGB to output
}

void RGBSend(GPIO_TypeDef * port, led_fn_t GetLED, uint32_t frame, uint8_t brightness)
{
	int maskon = 1<<PIN_RGB_NUM;
	int maskoff = 1<<(16+PIN_RGB_NUM);

	port->BSHR = maskoff;

	for (uint32_t ledno = 0; ledno < NUM_LEDS; ledno++) {
		int32_t led_color = (int32_t)GetLED(ledno, frame, brightness);

		for (int remaining = BITS_PER_LED; remaining; remaining--) {
			if( led_color < 0 )
			{
				port->BSHR = maskon;
				DelaySysTick(1);
				port->BSHR = maskoff;
			}
			else
			{
				port->BSHR = maskon;
				port->BSHR = maskoff;
				DelaySysTick(1);
			}
			led_color<<=1;
		}
	}

	// Send reset code: low for 80us
	port->BSHR = maskoff;
	Delay_Us(80U);
}
