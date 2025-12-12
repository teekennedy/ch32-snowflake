#include "tz_5050s2_driver.h"
#include "animations.h"
#include "funconfig.h"
#include <stdio.h>

#define PIN_RGB_NUM (PIN_RGB & 0xf)
#define TIME_SLICES_PER_BIT 4 // 4 is more reliable, 3 has less overhead.

uint32_t frame = 0;

void FillLED( uint32_t * buffer )
{
	static int ledno;
	uint32_t hi = 1<<(PIN_RGB_NUM);
	uint32_t lo = 1<<(PIN_RGB_NUM+16);

	if( ledno >= NUM_LEDS )
	{
		uint32_t * be = buffer + (BITS_PER_LED * TIME_SLICES_PER_BIT);
		do
		{
			buffer[0] = lo;
			buffer++;
		} while( buffer != be );
		ledno++;
		if( ledno > NUM_LEDS + 3 ) ledno = 0;
	}
	else
	{
		int32_t led_color = GetLEDRainbow( ledno, frame );

		// Force into signed bit.
		led_color <<= 8;

		uint32_t * be = buffer + (BITS_PER_LED * TIME_SLICES_PER_BIT);
		do
		{
			uint32_t val = ( led_color < 0 ) ? hi : lo;
			led_color<<=1;

			// This code here is what actually sets the state of the pin over time.
#if TIME_SLICES_PER_BIT == 4
			buffer[0] = hi;
			buffer[1] = val;
			buffer[2] = val;
			buffer[3] = lo;
			buffer+=4;
#elif TIME_SLICES_PER_BIT == 3
			buffer[0] = hi;
			buffer[1] = val;
			buffer[2] = lo;
			buffer+=3;
#else
			#error Not sure how to use this number of bits.
#endif
		} while( buffer != be );
		if( ledno == 0 ) frame++;
		ledno++;
	}
}

static uint32_t memory_buffer[BITS_PER_LED * TIME_SLICES_PER_BIT * 2]; //2 LEDs worth.

// The DMA has an interrupt when the buffer is half full, or when it's done. 
// That way we can choose to fill the part of the buffer that is not currently being output.
void DMA1_Channel2_IRQHandler( void ) __attribute__((interrupt)) __attribute__((section(".srodata")));
void DMA1_Channel2_IRQHandler( void ) 
{
	const int halfsamps = sizeof(memory_buffer)/sizeof(memory_buffer[0])/2;

	volatile int intfr = DMA1->INTFR;
	do
	{
		DMA1->INTFCR = DMA1_IT_GL2;

		// Gets called at the end-of-a frame.
		if( intfr & DMA1_IT_TC2 )
		{
			uint32_t * mbb = (uint32_t*)( memory_buffer + halfsamps );
			FillLED( mbb );
		}

		// Gets called halfway through the frame
		if( intfr & DMA1_IT_HT2 )
		{
			uint32_t * mbb = (uint32_t*)( memory_buffer );
			FillLED( mbb );
		}
		intfr = DMA1->INTFR;
	} while( intfr );
}

void RGBInit(int gpio_pin, GPIO_TypeDef *gpio_port)
{
	// Enable DMA
	RCC->AHBPCENR = RCC_AHBPeriph_SRAM | RCC_AHBPeriph_DMA1;

	// Enable Timer 1
	RCC->APB2PCENR |= RCC_APB2Periph_TIM1;

	// GPIO D0 Output (where we are connecting our LED)
	funPinMode( gpio_pin, GPIO_CFGLR_OUT_10Mhz_PP );

	// Setup visual effect
	for( int i = 0; i < NUM_LEDS; i++ ) phases[i] = i<<8;

	// DMA2 can be configured to attach to T1CH1
	// The system can only DMA out at ~2.2MSPS.  2MHz is stable.
	// The idea here is that this copies, byte-at-a-time from the memory
	// into the peripheral addres.
	DMA1_Channel2->CNTR = sizeof(memory_buffer) / sizeof(memory_buffer[0]);
	DMA1_Channel2->MADDR = (uint32_t)memory_buffer;
	DMA1_Channel2->PADDR = (uint32_t)&gpio_port->BSHR;
	DMA1_Channel2->CFGR = 
		DMA_CFGR1_DIR |                      // MEM2PERIPHERAL
		DMA_CFGR1_PL |                       // High priority.
		DMA_CFGR1_MSIZE_1 |                  // 32-bit memory
		DMA_CFGR1_PSIZE_1 |                  // 32-bit peripheral
		DMA_CFGR1_MINC |                     // Increase memory.
		DMA_CFGR1_CIRC |                     // Circular mode.
		DMA_CFGR1_HTIE |                     // Half-trigger
		DMA_CFGR1_TCIE |                     // Whole-trigger
		DMA_CFGR1_EN;                        // Enable

	NVIC_EnableIRQ( DMA1_Channel2_IRQn );
	DMA1_Channel2->CFGR |= DMA_CFGR1_EN;


	// NOTE: You can also hook up DMA1 Channel 3 to T1C2,
	// if you want to output to multiple IO ports at
	// at the same time.  Just be aware you have to offset
	// the time they read at by at least 1/8Mth of a second.

	// Setup Timer1.
	RCC->APB2PRSTR = RCC_APB2Periph_TIM1;    // Reset Timer
	RCC->APB2PRSTR = 0;

	// Timer 1 setup.
	// Timer 1 is what will trigger the DMA, Channel 2 engine.
	TIM1->PSC = 0x0000;                      // Prescaler 
#if TIME_SLICES_PER_BIT == 4
	TIM1->ATRLR = 13;                        // Auto Reload - sets period (48MHz / (13+1) = 3.42MHz) valid divisors = 11-20
#elif TIME_SLICES_PER_BIT == 3
	TIM1->ATRLR = 13;                        // Auto Reload - sets period (48MHz / (17+1) = 2.66MHz) valid divisors = 14-20
#endif
	TIM1->SWEVGR = TIM_UG | TIM_TG;          // Reload immediately + Trigger DMA
	TIM1->CCER = TIM_CC1E | TIM_CC1P;        // Enable CH1 output, positive pol
	TIM1->CHCTLR1 = TIM_OC1M_2 | TIM_OC1M_1; // CH1 Mode is output, PWM1 (CC1S = 00, OC1M = 110)
	TIM1->CH1CVR = 6;                        // Set the Capture Compare Register value to 50% initially
	TIM1->BDTR = TIM_MOE;                    // Enable TIM1 outputs
	TIM1->CTLR1 = TIM_CEN;                   // Enable TIM1
	TIM1->DMAINTENR = TIM_UDE | TIM_CC1DE;   // Trigger DMA on TC match 1 (DMA Ch2) and TC match 2 (DMA Ch3)
}

