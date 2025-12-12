#include "ch32fun.h"
#include <stdio.h>


// Include the implementation of the rgb led driver
#define RGB_LED_IMPLEMENTATION

#include "tz_5050s2_driver.h"
#include "animations.h"


int main()
{
	SystemInit();

	funGpioInitAll(); // Enable GPIOs
	
	RGBInit(PIN_RGB, PORT_RGB); // Start RGB animation

	while(1)
	{
		Delay_Ms(1000);
	}
}
