/* Single-File-Header for using asynchronous LEDs using GPIO.

	 The timings are specifically for the TZ-5050S2, a generic alternative of the WS2812B.

   If you are including this in main, simply
	#define RGB_LED_IMPLEMENTATION
*/

#ifndef _TZ_5050S2__SIMPLE
#define _TZ_5050S2__SIMPLE

#include <stdint.h>

void RGBSend( GPIO_TypeDef * port, int pin, uint8_t * data, int data_len, int start_offset, int bytes_to_send );

#ifdef RGB_LED_IMPLEMENTATION

#include "funconfig.h"

#if FUNCONF_SYSTICK_USE_HCLK != 1
#error TZ_5050S2 Driver Requires FUNCONF_SYSTICK_USE_HCLK
#endif

#ifndef FUNCONF_SYSTEM_CORE_CLOCK
#error TZ_5050S2 Driver Requires FUNCONF_SYSTEM_CORE_CLOCK
#endif

#define TZ_5050S2_TICKS_SHORT 1
#define TZ_5050S2_TICKS_LONG 1

void RGBInit(int pin)
{
	funPinMode(pin, GPIO_CFGLR_OUT_10Mhz_PP); // Set PIN_RGB to output
}

void RGBSend(GPIO_TypeDef * port, int pin, uint8_t * data, int data_len, int start_offset, int bytes_to_send )
{
	int maskon = 1<<pin;
	int maskoff = 1<<(16+pin);

	port->BSHR = maskoff;

	if( !data || data_len <= 0 || bytes_to_send <= 0 )
	{
		return;
	}

	int idx = start_offset % data_len;
	if( idx < 0 )
	{
		idx += data_len;
	}

	int remaining = bytes_to_send;
	while( remaining-- )
	{
		uint8_t byte = data[idx];
		idx++;
		if( idx >= data_len )
		{
			idx = 0;
		}

		int i;
		for( i = 0; i < 8; i++ )
		{
			if( byte & 0x80 )
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
			byte <<= 1;
		}
	}

	// Send reset code: low for 80us
	port->BSHR = maskoff;
	Delay_Us(80U);
}

#endif

#endif
