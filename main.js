'use strict';

const ApiAccesser = require('./apiAccess');
const Lcd = require('lcd');
const helpers = require('./helpers');
const Gpio = require('onoff').Gpio;

// Set the Spotify scopes and initialise the API interface
const scope = ['user-read-playback-state', 'user-modify-playback-state', 'user-modify-playback-state'];
const api = new ApiAccesser('auth.json', '8edbc5b81af145c2953f9f1609797629', {
    scope: scope,
});
// Initialise components connected via GPIO headers
const skipButton = new Gpio(26, 'in', 'both'); // Physical pin #37
const playPauseButton = new Gpio(5, 'in', 'both'); // Physical pin #29
const previousButton = new Gpio(6, 'in', 'both'); // Physical pin #31
const lcdColumns = 16;
const lcdRows = 2;
const lcd = new Lcd({
    rs: 25, // Physical Pin #22
    e: 24, // Physical Pin #18
    // Data 4, 5, 6 and 7
    data: [22, 23, 27, 17], // Physical Pin #15, #16, #13 and #11
    cols: lcdColumns,
    rows: lcdRows
})

var printSongCycle = null;
var buttonBookedOut = false;
var currentlyPlayingSong = null;
var currentlyDisplaying = null;

process.on('SIGINT', _ => {
    console.log('bye');
    resetDisplayCycles();
    lcd.print('Spotbox off', _ => {
        lcd.close();
        process.exit();
    });
});


// Ensure API is ready to be accessed
api.emitter.on('ready', _ => {
    console.log("API Initialised");
    lcd.on('ready', _=> {
        console.log("Screen Initialised");
        buttonSetup();
        var previousSong = null;

        setInterval(_ => {
            api.currentlyPlaying().then((songInfo) => {
                var printContent = null;
                currentlyPlayingSong = songInfo;

                // No song is currently playing
                if (currentlyPlayingSong == null) {
                    var printContent = helpers.getScreenTextObject('Spotbox on', 'Nothing Playing');
                    
                    // Ensure the screen isn't unnecessarily updated
                    if (helpers.isScreenChanging(currentlyDisplaying, printContent)){
                        print(printContent);
                        currentlyDisplaying = printContent;
                    }
                }
                else {
                    // First call cycle, ensure variables are initialised properly
                    if (previousSong == null) {
                        previousSong = currentlyPlayingSong;
                        
                        // Idlescreen to any other state transition
                        if (!helpers.isScreenChanging(currentlyDisplaying, { lineOne: 'Spotbox on', lineTwo: 'Nothing Playing'})){
                            resetDisplayCycles();
                        }

                        // The currently playing song is playing
                        if (currentlyPlayingSong.playing == true && currentlyPlayingSong == previousSong){
                            var printContent = helpers.getScreenTextObject(currentlyPlayingSong.trackName, helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                            
                            // Ensure we only print info when it is not currently present on screen
                            if (helpers.isScreenChanging(currentlyDisplaying, printContent)){
                                print(printContent);
                                console.log('Now Playing: %s - %s', printContent.lineOne, helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                            }
                        }
                        // The currently playing song is paused
                        else if (currentlyPlayingSong.playing == false){
                            var printContent = helpers.getScreenTextObject('     Paused     ', currentlyPlayingSong.trackName + ' - ' + helpers.stringifyArtists(currentlyPlayingSong.trackArtists));

                            // Ensure we only print info when it is not currently present on screen
                            if (helpers.isScreenChanging(currentlyDisplaying, printContent)){
                                print(printContent);
                                console.log('Currently Paused: %s - %s', currentlyPlayingSong.trackName, helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                            }
                        }
                    }

                    // Paused to Playing state transition
                    if (previousSong.playing == false && currentlyPlayingSong.playing == true) {
                        resetDisplayCycles();
                        var printContent = helpers.getScreenTextObject(currentlyPlayingSong.trackName, helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                        if (helpers.isScreenChanging(currentlyDisplaying, printContent)){
                            print(printContent);
                            console.log('Playback Continued');
                        }
                    }
                    // Playing to Paused state transition
                    else if (previousSong.playing == true && currentlyPlayingSong.playing == false) {
                        resetDisplayCycles();
                        var printContent = helpers.getScreenTextObject('     Paused     ', currentlyPlayingSong.trackName + ' - ' + helpers.stringifyArtists(currentlyPlayingSong.trackArtists));

                        // Ensure we only print info when it is not currently present on screen
                        if (helpers.isScreenChanging(currentlyDisplaying, printContent)){
                            print(printContent);
                            console.log('Playback Paused');
                        }
                    }
                    // Currently Playing Song transition
                    else if (previousSong.playing == true && currentlyPlayingSong.playing == true && previousSong.trackName != currentlyPlayingSong.trackName && previousSong.trackArtists != currentlyPlayingSong.trackArtists) {
                        resetDisplayCycles();

                        var printContent = helpers.getScreenTextObject(currentlyPlayingSong.trackName, helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                        print(printContent);
                        console.log('Now Playing: %s - %s', printContent.lineOne, helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                    }
                    // Currently Playing Song transition in a paused state is not possible. When paused, Skipping a song will result in the following Song being played.

                    // No state transition - Reinstanciating display cycles
                    else {
                        // Playing
                        if (printSongCycle == null && currentlyPlayingSong.playing == true) {
                            var printContent = helpers.getScreenTextObject(currentlyPlayingSong.trackName, helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                            print(printContent);
                        } 
                        // Paused
                        else if (printSongCycle == null && currentlyPlayingSong.playing == false) {
                            var printContent = helpers.getScreenTextObject('     Paused     ', currentlyPlayingSong.trackName + ' - ' + helpers.stringifyArtists(currentlyPlayingSong.trackArtists));
                            print(printContent);
                        }
                    }
                    // Write current state as past states for next cycle
                    previousSong = currentlyPlayingSong;
                }
            }).catch((err) => {
                console.log(err);
            });
        }, 1000);
    });
});

/**
 * Set up the hardware buttons and their functionatliy
 */
const buttonSetup = () => {
    skipButton.watch(_ => {
        // Lock Button to avoid sending multiple commands on the same press
        if (!buttonBookedOut) {
            buttonBookedOut = true;

            // Disable any ongoing screen scrolling
            if (printSongCycle) {
                resetDisplayCycles();
            }
            // API Call to play the next Song
            api.playNextSong().then(() => {
                buttonBookedOut = false;
            });
        }
    });

    playPauseButton.watch(_ => {
        // Lock Button to avoid sending multiple commands on the same press
        if (!buttonBookedOut) {
            buttonBookedOut = true;

            // Disable any ongoing screen scrolling
            if (printSongCycle) {
                resetDisplayCycles();
            }

            // Get playing state from a fresh API call
            api.currentlyPlaying().then((songInfo) => {
                // Find out which API call should be performed
                if (songInfo.playing == true){
                    api.pauseCurrentlyPlaying().then(() => {
                        buttonBookedOut = false;
                    });
                } else if (songInfo.playing == false){
                    api.playCurrentlyPlaying().then(() => {
                        buttonBookedOut = false;
                    });
                }
                // Reenable Button
            }).catch((reason) => {
                console.log("currentlyPlaying catch: " + reason);
            });
        }
    });

    previousButton.watch(_ => {
        // Lock Button to avoid sending multiple commands on the same press
        if (!buttonBookedOut) {
            buttonBookedOut = true;

            // Disable any ongoing screen scrolling
            if (printSongCycle) {
                resetDisplayCycles();
            }
            // API Call to play the next Song
            api.playPreviousSong().then(() => {
                buttonBookedOut = false;
            });
        }
    });
}

/**
 * Smart printing function that will cycle through any text that is too long
 * @param {object} text Text to be printed on the display. Use lineOne and lineTwo for corresponding LCD lines
 */
const print = (text) => {
    lcd.setCursor(0, 0);
    
    // Cycle both Lines if they are too big
    if (text.lineOne.length > lcdColumns && text.lineTwo.length > lcdColumns) {
        // Cycle the top row before and when completed, cycle the bottom row
        cycle(text.lineOne, 1, text.lineTwo).then(_ => {
            cycle(text.lineTwo, 2, text.lineOne)
        });
    } 
    // Only cycle top row if it is too big
    else if (text.lineOne.length > lcdColumns && text.lineTwo.length <= lcdColumns) {
        // Pad spare line as printing/clearing errors may occur randomly
        var lineTwo = text.lineTwo;
        while (lineTwo.length <= lcdColumns){
            lineTwo += ' ';
        }
        cycle(text.lineOne, 1, lineTwo);
    } 
    // Only cycle bottom row if it's too big
    else if (text.lineTwo.length > lcdColumns && text.lineOne.length <= lcdColumns) {
        // Pad spare line as printing/clearing errors may occur randomly
        var lineOne = text.lineOne;
        while (lineOne.length <= lcdColumns){
            lineOne += ' ';
        }
        cycle(text.lineTwo, 2, lineOne)
    } 
    // If both rows fit, just print both of them
    else if (text.lineOne.length <= lcdColumns && text.lineTwo.length <= lcdColumns) {
        // Pad spare characters as printing/clearing errors may occur randomly
        var lineOne = text.lineOne;
        var lineTwo = text.lineTwo;
        while (lineOne.length <= lcdColumns){
            lineOne += ' ';
        }
        while (lineTwo.length <= lcdColumns){
            lineTwo += ' ';
        }
        
        lcd.setCursor(0, 0);
        lcd.print(lineOne, _ => {
            lcd.setCursor(0, 1);
            lcd.print(lineTwo)
        });
        // Update current display text
        currentlyDisplaying = text;
    }
}

/**
 * Cycle text that does not fit onto the display
 * @param {string} text The text that should be cycled through
 * @param {int} lineCycle The number of the line that is being cycled through
 * @param {string} otherLine The text that should be printed onto the spare line
 */
function cycle(text, lineCycle, otherLine) {
    var i = 0; // iterator and keeping track of how many characters have been shifted
    text += ' '; // add a whitespace at the end for better readability
    return new Promise((resolve, reject) => {
        printSongCycle = setInterval(_ => {
            if (i < text.length + 1) {
                // Set string that should be printed
                var char = text.substring(0, i); 
                var newPrintLine = text.slice(i); 
                newPrintLine = newPrintLine.concat(char);

                // Print the lines as configured in parameters
                if (lineCycle == 1) {
                    dumbPrint(newPrintLine.slice(0, 16), otherLine.slice(0, 16));
                } else if (lineCycle == 2) {
                    dumbPrint(otherLine.slice(0, 16), newPrintLine.slice(0, 16));
                }
                i++;
            } 
            // When completed, terminate cycle and report complete status
            else {
                clearInterval(printSongCycle);
                printSongCycle = null;
                resolve();
            }
        }, 1000);
    });
}

/**
 * Print the literal parameters to the LCD
 * @param {string} lineOne Top line to be printed
 * @param {string} lineTwo Bottom line to be printed
 */
const dumbPrint = (lineOne, lineTwo) => {
    lcd.setCursor(0, 0);
    lcd.print(lineOne, err => {
        if (err) {
            throw err;
        }

        lcd.setCursor(0, 1);
        lcd.print(lineTwo, err => {
            if (err) {
                throw err;
            }
        });
        // Update current display text
        currentlyDisplaying = helpers.getScreenTextObject(lineOne, lineTwo);
    });
}

/**
 * Cancel any ongoing screen prints and ensure it is ready to print to
 */
function resetDisplayCycles() {
    clearInterval(printSongCycle);
    printSongCycle = null;
    lcd.clear();
}