#include "ch32fun.h"
#include <stdio.h>
#include "tz_5050s2_driver.h"
#include "animations.h"
#include "touch.h"
#include "nvram.h"

// Default values for settings
uint8_t ledFuncIndex = 0;
uint8_t ledBrightness = 3;
bool shuffleOn = true;

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
	uint8_t persisted_led_index = ledFuncIndex;
	buttonPress_t lastButton = buttonNone;
	const uint32_t frame_delay_ticks = 67U * DELAY_MS_TIME;
	const uint32_t shuffle_interval_ticks = DELAY_SEC_COUNT(60);
	uint32_t shuffle_deadline = SysTick->CNT + shuffle_interval_ticks;
	while(1)
	{
		uint32_t frame_start = SysTick->CNT;
		uint32_t targend = frame_start + frame_delay_ticks;
		if (shuffleOn && ((int32_t)(frame_start - shuffle_deadline)) >= 0) {
			ledFuncIndex = (uint8_t)((ledFuncIndex + 1U) % ledFuncCount);
			shuffle_deadline = frame_start + shuffle_interval_ticks;
		}
		RGBSend(PORT_RGB, ledFuncs[ledFuncIndex], frame, ledBrightness + 1);
		frame++;
		buttonPress_t button = buttons_read();
		if (button != lastButton) {
			lastButton = button;
			// printf("Button pressed: %x", button);
			bool settings_changed = false;
			bool save_led_index = true;
			bool reset_shuffle_timer = false;
			switch (button) {
				case buttonNext:
					ledFuncIndex = (uint8_t)((ledFuncIndex + 1U) % ledFuncCount);
					if (shuffleOn) {
						save_led_index = false;
						reset_shuffle_timer = true;
					} else {
						settings_changed = true;
					}
					break;
				case buttonShuffle:
				    shuffleOn = !shuffleOn;
				    settings_changed = true;
				    reset_shuffle_timer = shuffleOn;
				    // Give user feedback that shuffle button was pressed
				    if (shuffleOn) {
						RGBSend(PORT_RGB, GetLEDShuffleOn, frame, ledBrightness + 1);
				    } else {
						RGBSend(PORT_RGB, GetLEDShuffleOff, frame, ledBrightness + 1);
				    }
				    Delay_Ms(250);
				    break;
				case buttonBrightness:
				    ledBrightness--;
				    if (ledBrightness >= 4) {
				    	ledBrightness = 3;
				    }
				    settings_changed = true;
				    if (shuffleOn) {
				    	save_led_index = false;
				    }
				default:
					break;
			}
			if (reset_shuffle_timer) {
				shuffle_deadline = SysTick->CNT + shuffle_interval_ticks;
			}
			if (settings_changed) {
				uint8_t target_led_index = save_led_index ? ledFuncIndex : persisted_led_index;
				NvramSettings new_settings = {
					.led_brightness = ledBrightness,
					.led_func_index = target_led_index,
					.shuffle_on = shuffleOn ? 1U : 0U,
				};
				NvramSaveSettings(&new_settings);
				if (save_led_index) {
					persisted_led_index = ledFuncIndex;
				}
			}
		}
		while (((int32_t)(SysTick->CNT - targend)) < 0) {
			;
		}
	}
}
