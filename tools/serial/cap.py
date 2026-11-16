#!/usr/bin/env python3
# Plain serial capture. usage: SW_TTY=/dev/cu.usbserial-XXXX cap.py <baud> <seconds> <outfile>   (the switch uses 9600)
import os, sys, termios, time, select
dev=os.environ.get("SW_TTY") or sys.exit("set SW_TTY to the console device"); baud=int(sys.argv[1]); dur=float(sys.argv[2]); out=open(sys.argv[3],"wb",buffering=0)
fd=os.open(dev, os.O_RDWR|os.O_NOCTTY|os.O_NONBLOCK)
a=termios.tcgetattr(fd); B=getattr(termios,f"B{baud}")
a[0]=0;a[1]=0;a[2]=termios.CS8|termios.CREAD|termios.CLOCAL;a[3]=0;a[4]=B;a[5]=B
termios.tcsetattr(fd,termios.TCSANOW,a)
end=time.time()+dur
while time.time()<end:
    r,_,_=select.select([fd],[],[],0.2)
    if r:
        try: out.write(os.read(fd,4096))
        except BlockingIOError: pass
