#include "ch32fun.h"
#include <stdio.h>
#include "tz_5050s2_driver.h"
#include "animations.h"
#include "touch.h"
#include "nvram.h"

uint8_t ledFuncIndex = 0;
uint8_t ledBrightness = 3;
bool shuffleOn = false;

int main()
{
	SystemInit();

	funGpioInitAll(); // Enable GPIOs
	
	buttons_init();
	RGBInit(PIN_RGB);

	int frame = 0;
	led_fn_t ledFuncs[] = {
		GetLEDTwinkleIce,
		GetLEDTwinkleRedGreen,
		GetLEDShootingStar,
		GetLEDRainbow,
	};
	const uint32_t ledFuncCount = sizeof(ledFuncs) / sizeof(ledFuncs[0]);
	NvramSettings nvram_settings;
	if (NvramLoadSettings(&nvram_settings)) {
		ledBrightness = nvram_settings.led_brightness;
		ledFuncIndex = nvram_settings.led_func_index % ledFuncCount;
		shuffleOn = nvram_settings.shuffle_on;
	}
	buttonPress_t lastButton = buttonNone;
	const uint32_t frame_delay_ticks = 67U * DELAY_MS_TIME;
	while(1)
	{
		uint32_t targend = SysTick->CNT + frame_delay_ticks;
		RGBSend(PORT_RGB, ledFuncs[ledFuncIndex], frame, ledBrightness + 1);
		frame++;
		buttonPress_t button = buttons_read();
		if (button != lastButton) {
			lastButton = button;
			// printf("Button pressed: %x", button);
			bool settings_changed = false;
			switch (button) {
				case buttonNext:
					ledFuncIndex++;
					ledFuncIndex %= ledFuncCount;
					settings_changed = true;
					break;
				case buttonShuffle:
				    shuffleOn = !shuffleOn;
				    settings_changed = true;
				    break;
				case buttonBrightness:
				    ledBrightness--;
				    if (ledBrightness >= 4) {
				    	ledBrightness = 3;
				    }
				    settings_changed = true;
				default:
					break;
			}
			if (settings_changed) {
				NvramSettings new_settings = {
					.led_brightness = ledBrightness,
					.led_func_index = ledFuncIndex,
					.shuffle_on = shuffleOn ? 1U : 0U,
				};
				NvramSaveSettings(&new_settings);
			}
		}
		while (((int32_t)(SysTick->CNT - targend)) < 0) {
			;
		}
	}
}
