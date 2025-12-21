#ifndef _NVRAM_H
#define _NVRAM_H

#include <stdbool.h>
#include <stdint.h>

#ifndef NVRAM_ENABLE
#define NVRAM_ENABLE 1
#endif

typedef struct {
	uint8_t led_brightness;
	uint8_t led_func_index;
	uint8_t shuffle_on;
} NvramSettings;

bool NvramLoadSettings(NvramSettings * settings);
void NvramSaveSettings(const NvramSettings * settings);

#endif
