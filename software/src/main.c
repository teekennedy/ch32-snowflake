#include "ch32fun.h"
#include <stdio.h>
#include "tz_5050s2_driver.h"
#include "animations.h"
#include "touch.h"

int ledFuncIndex = 0;
int ledBrightness = 0;
bool shuffleOn = false;

int main()
{
	SystemInit();

	funGpioInitAll(); // Enable GPIOs
	
	buttons_init();
	RGBInit(PIN_RGB);

	int frame = 0;
	led_fn_t ledFuncs[] = {
		GetLEDTwinkle,
		GetLEDRainbow,
	};
	buttonPress_t lastButton = buttonNone;
	// uint32_t iteration = 1;
	while(1)
	{
		// printf("Iteration: %lu\nFrame: %i\n", iteration, frame);
		RGBSend(PORT_RGB, ledFuncs[ledFuncIndex], frame, ledBrightness);
		frame++;
		Delay_Ms(100);
		buttonPress_t button = buttons_read();
		if (button != lastButton) {
			lastButton = button;
			printf("Button pressed: %x", button);
			switch (button) {
				case buttonNext:
					ledFuncIndex++;
			  	ledFuncIndex %= sizeof(ledFuncs);
					break;
				case buttonShuffle:
				    shuffleOn = !shuffleOn;
				    break;
				case buttonBrightness:
				    ledBrightness++;
				    ledBrightness %= 4;
				default:
					break;
			}
		}
	}
}
