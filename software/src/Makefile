all : flash

TARGET:=main
TARGET_MCU:=CH32V003

include rgb_led/Makefile
include touch/Makefile
include nvram/Makefile
include ../ch32fun/ch32fun/ch32fun.mk

flash : cv_flash
clean : cv_clean
