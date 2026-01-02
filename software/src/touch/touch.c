#include "touch.h"
#include "ch32fun.h"
#include <stdint.h>

uint32_t endtime;

buttonPress_t last_button = buttonNone;

void EXTI7_0_IRQHandler(void) __attribute__((interrupt));
void EXTI7_0_IRQHandler(void)
{
    endtime = SysTick->CNT;
    EXTI->INTFR = 0xffffffff;
}

#define GPIOPortByBase(i) ((GPIO_TypeDef *)(GPIOA_BASE + 0x0400 * (i)))

// The "port" is:
// 0 for Port A
// 1 for Port B
// 2 for Port C
// 3 for Port D
int MeasureTouch(int portno, int pin, int pu_mode)
{
    uint32_t starttime;
    GPIO_TypeDef *port = GPIOPortByBase(portno);
    uint32_t pinx4 = pin << 2;

    // Mask out just our specific port.  This way we don't interfere with other
    // stuff that may be on this port.
    uint32_t base = port->CFGLR & (~(0xf << pinx4));

    // Mode for CFGLR when asserted.
    uint32_t setmode = base | (GPIO_CFGLR_OUT_2Mhz_PP) << (pinx4);

    // Mode for CFGLR when it drifts.
    uint32_t releasemode = base | (pu_mode) << (pinx4);

    // Assert pin
    port->CFGLR = setmode;
    port->BSHR = 1 << (pin + 16);

    // Setup pin-change-interrupt.  This will trigger when the voltage on the
    // pin rises above the  schmitt trigger threshold.
    AFIO->EXTICR = portno << (pin * 2);
    EXTI->INTENR = 0xffffffff; // Enable EXT3
    EXTI->RTENR = 0xffffffff;  // Rising edge trigger

    // Tricky, we want the release to happen at an un-aligned address.
    // This actually doubles our touch sensor resolution.
    asm volatile(".balign 4; c.nop");
    port->CFGLR = releasemode;
    starttime = SysTick->CNT;
    endtime = starttime + 384;
    port->BSHR = 1 << (pin);

// Allow up to 384 cycles for the pin to change.
#define DELAY8 \
    asm volatile("c.nop;c.nop;c.nop;c.nop;c.nop;c.nop;c.nop;c.nop;");
    DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8
    DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8
    DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8
    DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8
    DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8
    DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8 DELAY8

    // Optimization: If you did the nop sled in assembly, the interrupt could scoot to the end

    // Disable EXTI
    EXTI->INTENR = 0;

    // Optional assert pin when done to prevent it from noodling around.
    // port->CFGLR = setmode;
    // port->BSHR = 1<<(pin+16);

    return endtime - starttime;
}

#ifndef TOUCH_DEBUG
#define TOUCH_DEBUG 0
#endif

#if TOUCH_DEBUG
#include <stdio.h>
#endif

#define TOUCH_PAD_COUNT 3
#define TOUCH_BASELINE_SAMPLES 32
#define TOUCH_THRESHOLD_OFFSET 6

static const uint8_t touch_ports[TOUCH_PAD_COUNT] = { 3, 3, 3 };
static const uint8_t touch_pins[TOUCH_PAD_COUNT] = { 2, 3, 4 };
static const buttonPress_t touch_buttons[TOUCH_PAD_COUNT] = {
    buttonNext,
    buttonShuffle,
    buttonBrightness,
};

static uint16_t touch_baseline[TOUCH_PAD_COUNT];

static uint16_t Median3(uint16_t a, uint16_t b, uint16_t c)
{
    if (a > b) {
        uint16_t tmp = a;
        a = b;
        b = tmp;
    }
    if (b > c) {
        uint16_t tmp = b;
        b = c;
        c = tmp;
    }
    if (a > b) {
        uint16_t tmp = a;
        a = b;
        b = tmp;
    }
    return b;
}

static void TouchCalibrate(void)
{
    for (int pad = 0; pad < TOUCH_PAD_COUNT; pad++) {
        uint32_t sum = 0;
        for (int sample = 0; sample < TOUCH_BASELINE_SAMPLES; sample++) {
            sum += MeasureTouch(touch_ports[pad], touch_pins[pad], GPIO_CFGLR_IN_FLOAT);
        }
        touch_baseline[pad] = (uint16_t)(sum / TOUCH_BASELINE_SAMPLES);
    }
}

void buttons_init(){
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOD | RCC_APB2Periph_AFIO;

    // enable pin-change-interrupt.
    NVIC_EnableIRQ(EXTI7_0_IRQn);

    Delay_Ms(20);
    TouchCalibrate();
}

buttonPress_t buttons_read() {
    buttonPress_t read = buttonNone;
    uint16_t values[TOUCH_PAD_COUNT];

    for (int pad = 0; pad < TOUCH_PAD_COUNT; pad++) {
        uint16_t a = MeasureTouch(touch_ports[pad], touch_pins[pad], GPIO_CFGLR_IN_FLOAT);
        uint16_t b = MeasureTouch(touch_ports[pad], touch_pins[pad], GPIO_CFGLR_IN_FLOAT);
        uint16_t c = MeasureTouch(touch_ports[pad], touch_pins[pad], GPIO_CFGLR_IN_FLOAT);
        values[pad] = Median3(a, b, c);
        uint16_t threshold = touch_baseline[pad] + TOUCH_THRESHOLD_OFFSET;
        if (values[pad] >= threshold) {
            read |= touch_buttons[pad];
        }
    }

#if TOUCH_DEBUG
    static uint32_t next_debug = 0;
    uint32_t now = SysTick->CNT;
    if (((int32_t)(now - next_debug)) >= 0) {
        printf("touch raw: %u %u %u base: %u %u %u\n",
               values[0], values[1], values[2],
               touch_baseline[0], touch_baseline[1], touch_baseline[2]);
        next_debug = now + (DELAY_MS_TIME * 200U);
    }
#endif

    return read;
}
