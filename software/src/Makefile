all : flash

TARGET:=main
TARGET_MCU:=CH32V203G6U6
TARGET_MCU_PACKAGE:=CH32V203G6U6

include ../ch32fun/ch32fun/ch32fun.mk
CFLAGS+=-I./rgb_led

flash : cv_flash
clean : cv_clean
