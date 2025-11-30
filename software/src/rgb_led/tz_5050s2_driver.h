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

/*
 * This ticks-based implementation 
// Min 0.2, typ 0.295, max 0.35.
// On CH32V003 this comes out to 14.16 ticks
#define TZ_5050S2_T0H_TICKS Ticks_from_Us(0.295)
// Min 0.55, typ 0.595, max 1.2
// On CH32V003 this comes out to 28.56 ticks
#define TZ_5050S2_T0L_TICKS Ticks_from_Us(0.595)
// Min 0.55, typ 0.595, max 1.2
// On CH32V003 this comes out to 28.56 ticks
#define TZ_5050S2_T1H_TICKS Ticks_from_Us(0.595)
// Min 0.2, typ 0.295, max 0.35
// On CH32V003 this comes out to 14.16 ticks
#define TZ_5050S2_T1L_TICKS Ticks_from_Us(0.295)
*/

#define TZ_5050S2_TICKS_SHORT 1
#define TZ_5050S2_TICKS_LONG 1

// Min 0.2, typ 0.295, max 0.35.
// On CH32V003 0.295us comes out to 14.16 ticks
#define TZ_5050S2_T0H_TICKS TZ_5050S2_TICKS_SHORT
// Min 0.55, typ 0.595, max 1.2
// On CH32V003 this comes out to 28.56 ticks
#define TZ_5050S2_T0L_TICKS TZ_5050S2_TICKS_LONG
// Min 0.55, typ 0.595, max 1.2
// On CH32V003 this comes out to 28.56 ticks
#define TZ_5050S2_T1H_TICKS TZ_5050S2_TICKS_LONG
// Min 0.2, typ 0.295, max 0.35
// On CH32V003 this comes out to 14.16 ticks
#define TZ_5050S2_T1L_TICKS TZ_5050S2_TICKS_SHORT

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
				DelaySysTick(TZ_5050S2_T1H_TICKS);
				port->BSHR = maskoff;
				// DelaySysTick(TZ_5050S2_T1L_TICKS);
			}
			else
			{
				port->BSHR = maskon;
				// DelaySysTick(TZ_5050S2_T0H_TICKS);
				port->BSHR = maskoff;
				DelaySysTick(TZ_5050S2_T0L_TICKS);
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
