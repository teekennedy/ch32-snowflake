#include "nvram.h"
#include "ch32fun.h"

#define NVRAM_BRIGHTNESS_MASK 0x03
#define NVRAM_SHUFFLE_MASK 0x04
#define NVRAM_LED_FUNC_MASK 0xF8

static uint8_t NvramPackSettings(const NvramSettings * settings)
{
	uint8_t packed = 0;

	packed |= settings->led_brightness & NVRAM_BRIGHTNESS_MASK;
	packed |= (settings->shuffle_on ? 1U : 0U) << 2;
	packed |= (settings->led_func_index & 0x1f) << 3;

	return packed;
}

static void NvramUnpackSettings(uint8_t packed, NvramSettings * settings)
{
	settings->led_brightness = packed & NVRAM_BRIGHTNESS_MASK;
	settings->shuffle_on = (packed & NVRAM_SHUFFLE_MASK) ? 1U : 0U;
	settings->led_func_index = (packed & NVRAM_LED_FUNC_MASK) >> 3;
}

#if NVRAM_ENABLE

static void NvramWriteOptionData(uint8_t data0, uint8_t data1)
{
	volatile uint16_t hold[6];
	uint32_t *hold32p = (uint32_t *)hold;
	uint32_t *ob32p = (uint32_t *)OB_BASE;

	hold32p[0] = ob32p[0];
	hold32p[1] = data0 | ((uint32_t)data1 << 16);
	hold32p[2] = ob32p[2];

	FLASH->KEYR = FLASH_KEY1;
	FLASH->KEYR = FLASH_KEY2;
	FLASH->OBKEYR = FLASH_KEY1;
	FLASH->OBKEYR = FLASH_KEY2;

	FLASH->CTLR |= CR_OPTER_Set;
	FLASH->CTLR |= CR_STRT_Set;
	while (FLASH->STATR & FLASH_BUSY);
	FLASH->CTLR &= CR_OPTER_Reset;

	FLASH->CTLR |= CR_OPTPG_Set;
	uint16_t *ob16p = (uint16_t *)OB_BASE;
	for (int i = 0; i < (int)(sizeof(hold) / sizeof(hold[0])); i++) {
		ob16p[i] = hold[i];
		while (FLASH->STATR & FLASH_BUSY);
	}
	FLASH->CTLR &= CR_OPTPG_Reset;
	FLASH->CTLR |= CR_LOCK_Set;
}

bool NvramLoadSettings(NvramSettings * settings)
{
	uint8_t stored = (uint8_t)OB->Data0;
	uint8_t stored_check = (uint8_t)OB->Data1;

	if ((stored ^ stored_check) != 0xff) {
		return false;
	}

	NvramUnpackSettings(stored, settings);
	return true;
}

void NvramSaveSettings(const NvramSettings * settings)
{
	uint8_t packed = NvramPackSettings(settings);
	uint8_t packed_check = packed ^ 0xff;
	uint8_t stored = (uint8_t)OB->Data0;
	uint8_t stored_check = (uint8_t)OB->Data1;

	if ((stored ^ stored_check) == 0xff && stored == packed) {
		return;
	}

	NvramWriteOptionData(packed, packed_check);
}

#else

bool NvramLoadSettings(NvramSettings * settings)
{
	(void)settings;
	return false;
}

void NvramSaveSettings(const NvramSettings * settings)
{
	(void)settings;
}

#endif
