/* Single-File-Header for using asynchronous LEDs with the CH32V003 using GPIO.

   Copyright 2023 <>< Charles Lohr, under the MIT-x11 or NewBSD License, you choose!

   If you are including this in main, simply
	#define WS2812BSIMPLE_IMPLEMENTATION

   You may also want to define
  #define WS2812BSIMPLE_NO_IRQ_TWEAKING

*/

#ifndef _WS2812B_SIMPLE
#define _WS2812B_SIMPLE

#include <stdint.h>

void WS2812BSimpleSend( GPIO_TypeDef * port, int pin, uint8_t * data, int data_len, int start_offset, int bytes_to_send );

#ifdef WS2812BSIMPLE_IMPLEMENTATION

#include "funconfig.h"

#if FUNCONF_SYSTICK_USE_HCLK != 1
#error WS2812B Driver Requires FUNCONF_SYSTICK_USE_HCLK
#endif

#ifndef FUNCONF_SYSTEM_CORE_CLOCK
#error WS2812B Driver Requires FUNCONF_SYSTEM_CORE_CLOCK
#endif

// Min 0.2, typ 0.295, max 0.35
#define WS2812_T0H_TICKS Ticks_from_Us(0.295)
// Min 0.55, typ 0.595, max 1.2
#define WS2812_T0L_TICKS Ticks_from_Us(0.595)
// Min 0.55, typ 0.595, max 1.2
#define WS2812_T1H_TICKS Ticks_from_Us(0.595)
// Min 0.2, typ 0.295, max 0.35
#define WS2812_T1L_TICKS Ticks_from_Us(0.295)

void WS2812BSimpleSend( GPIO_TypeDef * port, int pin, uint8_t * data, int data_len, int start_offset, int bytes_to_send )
{
	int port_id = (((intptr_t)port-(intptr_t)GPIOA)>>10);
	RCC->APB2PCENR |= (RCC_APB2Periph_GPIOA<<port_id);  // Make sure port is enabled.

	int poffset = (pin*4);
	port->CFGLR = ( port->CFGLR & (~(0xf<<poffset))) | ((GPIO_Speed_50MHz | GPIO_CNF_OUT_PP)<<(poffset));

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
				DelaySysTick(WS2812_T1H_TICKS);
				port->BSHR = maskoff;
				DelaySysTick(WS2812_T1L_TICKS);
			}
			else
			{
#ifndef WS2812BSIMPLE_NO_IRQ_TWEAKING
				__disable_irq();
#endif
				port->BSHR = maskon;
				DelaySysTick(WS2812_T0H_TICKS);
				port->BSHR = maskoff;
#ifndef WS2812BSIMPLE_NO_IRQ_TWEAKING
				__enable_irq();
#endif
				DelaySysTick(WS2812_T0L_TICKS);
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
