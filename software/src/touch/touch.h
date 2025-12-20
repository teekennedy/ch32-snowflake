#ifndef _TOUCH_H
#define _TOUCH_H

typedef enum {
    buttonNone = 0x0,
    buttonNext = 0x1,
    buttonShuffle = 0x2,
    buttonBrightness = 0x4,
} buttonPress_t;

void buttons_init();

buttonPress_t buttons_read();

#endif
