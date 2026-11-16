#!/usr/bin/env python3
# Serial console bridge for the switch (9600 8N1).
# usage: SW_TTY=/dev/cu.usbserial-XXXX bridge.py
#   RX -> console.log, anything written to the FIFO "tx" -> TX (see tx.sh). Files live next to this script.
#   While a file "autostop" exists: presses Enter at "Autoboot in" (opens the boot menu).
#   While a file "menuchoice" also exists: then types its content at "Enter your choice".
import os, sys, termios, time, select
D=os.path.dirname(os.path.abspath(__file__))
dev=os.environ.get("SW_TTY") or sys.exit("set SW_TTY to the console device, e.g. /dev/cu.usbserial-XXXX (macOS) or /dev/ttyUSB0")
fifo=os.path.join(D,"tx")
if not os.path.exists(fifo): os.mkfifo(fifo)
log=open(os.path.join(D,"console.log"),"ab",buffering=0)
fd=os.open(dev, os.O_RDWR|os.O_NOCTTY|os.O_NONBLOCK)
a=termios.tcgetattr(fd); B=termios.B9600
a[0]=0;a[1]=0;a[2]=termios.CS8|termios.CREAD|termios.CLOCAL;a[3]=0;a[4]=B;a[5]=B
termios.tcsetattr(fd,termios.TCSANOW,a)
ff=os.open(fifo, os.O_RDWR|os.O_NONBLOCK)
tail=b""; armed=False
while True:
    r,_,_=select.select([fd,ff],[],[],0.05)
    if fd in r:
        try: d=os.read(fd,4096)
        except BlockingIOError: d=b""
        log.write(d); tail=(tail+d)[-200:]
        if b"Autoboot in" in tail and os.path.exists(os.path.join(D,"autostop")):
            os.write(fd,b"\r"); log.write(b"\n<<BRIDGE: sent CR at autoboot>>\n"); tail=b""; armed=True
        if armed and b"Enter your choice" in tail and os.path.exists(os.path.join(D,"menuchoice")):
            c=open(os.path.join(D,"menuchoice"),"rb").read().strip()
            time.sleep(0.3); os.write(fd,c); log.write(b"\n<<BRIDGE: sent menu choice "+c+b">>\n"); tail=b""; armed=False
    if ff in r:
        d=os.read(ff,4096)
        if d: os.write(fd,d)
