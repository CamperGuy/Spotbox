# Spotbox
Spotify Media Controller for Raspberry Pi

## Idea
Spotify media control is a pain when playing music on a device different to the one you are connecting to Spotify from. It lags, it starts playing on the device you're trying to change the music from rather than the one it's supposed to be playing on, it's just not great. When using a smart speaker like a Google Home there is also no way of finding the currently playing song without causing a playback disruption.
To solve this problem I have put a Raspberry Pi in a 3D Printed case that gets power over USB-C, which shows your currently playing song. For media control it has physical buttons underneath the screen that send their instructions directly to the Spotify API.

### Requirements
- Raspberry Pi 0W
- 16x2 LCD
- Access to a 3D Printer or Wood
- 3x Buttons
- Basic soldering equipment
- Circuit Development equipment
  - Breadboard
  - M-M, M-F, F-F Jumper Cables
  - Potentiometer (10k)
  - 5k Resistors
  - 2.2k Resistors
  
### Images
![Music Playing](https://helbling.uk/assets/images/spotbox/3.jpg)
![Pause Screen](https://helbling.uk/assets/images/spotbox/4.png)

## Special Thanks
[SimonAlexPaul](https://github.com/SimonAlexPaul) has offered me support throughout this project and help me get up to scratch with NodeJS and OAuth Flows.

### Status
Section | Status | Notes
--- | --- | ---
Main Code | Complete |
Initial Key Generation | WIP | Raw Code available, need proper implementation
Multiple Users | WIP | Ability to switch users has to be added
Case | Blocked | COVID-19 blocks my access to a 3D Printer

### Blog Page
Visit the Blog page on my [my website](https://helbling.uk/projects/view/1) for more information
