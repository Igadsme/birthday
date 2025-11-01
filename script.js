// Screen management
const screens = {
    greeting: document.getElementById('greeting-screen'),
    song: document.getElementById('song-screen'),
    letter: document.getElementById('letter-screen'),
    final: document.getElementById('final-screen')
};

let recognition;
let audioContext;
let candlesBlown = 0;
const totalCandles = 3;
let isBlowing = false;
let lastBlowTime = 0;
let microphoneStream = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeVoiceRecognition();
    initializeEventListeners();
});

// Initialize Web Speech API for voice recognition
function initializeVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
            if (transcript.includes('blow')) {
                blowCandle();
            }
        };
        
        recognition.onerror = (event) => {
            console.log('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                console.log('Speech recognition not allowed');
            }
        };
        
        recognition.onend = () => {
            // Restart recognition if still on greeting screen
            if (screens.greeting.classList.contains('active') && recognition) {
                try {
                    recognition.start();
                } catch (e) {
                    console.log('Could not restart recognition:', e);
                }
            }
        };
    }
    
    // Microphone detection will be started when user clicks the button
}

// Event listeners
function initializeEventListeners() {
    const startBtn = document.getElementById('start-btn');
    let firstClick = true;
    
    startBtn.addEventListener('click', () => {
        if (firstClick) {
            startMicrophoneDetection();
            startVoiceRecognition();
            firstClick = false;
        }
        // Allow clicking to blow candles as fallback
        blowCandle();
    });
    
    document.getElementById('open-letter-btn').addEventListener('click', openLetter);
    document.getElementById('next-btn').addEventListener('click', moveToFinalScreen);
}

// Start microphone detection for blowing
function startMicrophoneDetection() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !microphoneStream) {
        // Update UI to show microphone is being accessed
        const startBtn = document.getElementById('start-btn');
        startBtn.textContent = 'Requesting microphone access...';
        startBtn.disabled = true;
        
        navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            } 
        })
            .then(stream => {
                microphoneStream = stream;
                
                // Create AudioContext and resume it if suspended
                const micAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (micAudioContext.state === 'suspended') {
                    micAudioContext.resume();
                }
                
                const analyser = micAudioContext.createAnalyser();
                const microphone = micAudioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);
                
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.8;
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                const timeDataArray = new Uint8Array(analyser.fftSize);
                
                // Update UI
                startBtn.textContent = 'Microphone active! Blow into it or say "blow"';
                startBtn.disabled = false;
                
                // Show microphone status indicator
                const micStatus = document.getElementById('mic-status');
                const micStatusText = document.getElementById('mic-status-text');
                if (micStatus && micStatusText) {
                    micStatus.classList.add('active');
                    micStatusText.textContent = 'Listening... Blow now!';
                }
                
                let baselineVolume = 0;
                let samplesCount = 0;
                
                function checkBlow() {
                    if (!screens.greeting.classList.contains('active')) {
                        return;
                    }
                    
                    analyser.getByteFrequencyData(dataArray);
                    analyser.getByteTimeDomainData(timeDataArray);
                    
                    // Calculate average volume
                    const sum = dataArray.reduce((a, b) => a + b, 0);
                    const average = sum / bufferLength;
                    
                    // Calculate RMS (Root Mean Square) for time domain - better for detecting blowing
                    let sumSquares = 0;
                    for (let i = 0; i < timeDataArray.length; i++) {
                        const normalized = (timeDataArray[i] - 128) / 128;
                        sumSquares += normalized * normalized;
                    }
                    const rms = Math.sqrt(sumSquares / timeDataArray.length);
                    
                    // Establish baseline volume for first 30 samples
                    if (samplesCount < 30) {
                        baselineVolume = (baselineVolume * samplesCount + average) / (samplesCount + 1);
                        samplesCount++;
                    } else {
                        // Detect significant increase in volume (blowing)
                        const volumeIncrease = average - baselineVolume;
                        const rmsThreshold = 0.15; // Threshold for blowing detection
                        const volumeThreshold = 30; // Threshold for average volume
                        
                        const currentTime = Date.now();
                        if ((rms > rmsThreshold || volumeIncrease > volumeThreshold || average > 40) && 
                            currentTime - lastBlowTime > 800) {
                            lastBlowTime = currentTime;
                            
                            // Update status indicator
                            const micStatusText = document.getElementById('mic-status-text');
                            if (micStatusText) {
                                micStatusText.textContent = 'Detected blow! 💨';
                                setTimeout(() => {
                                    if (micStatusText && screens.greeting.classList.contains('active')) {
                                        micStatusText.textContent = 'Listening... Blow now!';
                                    }
                                }, 500);
                            }
                            
                            blowCandle();
                        }
                    }
                    
                    if (screens.greeting.classList.contains('active')) {
                        requestAnimationFrame(checkBlow);
                    }
                }
                
                // Small delay before starting detection to establish baseline
                setTimeout(() => {
                    checkBlow();
                }, 100);
            })
            .catch(err => {
                console.log('Microphone access error:', err);
                // Update UI
                const startBtn = document.getElementById('start-btn');
                startBtn.textContent = 'Microphone access denied. Click to blow candles instead';
                startBtn.disabled = false;
                
                // Show hint
                const hint = document.querySelector('.hint');
                if (hint) {
                    hint.textContent = 'Click the button multiple times to blow each candle';
                }
            });
    }
}

// Start voice recognition
function startVoiceRecognition() {
    if (recognition) {
        try {
            recognition.start();
        } catch (e) {
            console.log('Could not start voice recognition:', e);
        }
    }
}

// Blow candle
function blowCandle() {
    if (candlesBlown >= totalCandles || isBlowing) return;
    
    isBlowing = true;
    const candleIndex = candlesBlown;
    const candle = document.querySelectorAll('.candle')[candleIndex];
    const flame = document.querySelectorAll('.flame')[candleIndex];
    
    if (candle && !candle.classList.contains('extinguished')) {
        flame.classList.add('extinguished');
        candle.classList.add('extinguished');
        candlesBlown++;
        
        // Add a small delay before allowing next candle
        setTimeout(() => {
            isBlowing = false;
            
            if (candlesBlown >= totalCandles) {
                // All candles blown
                setTimeout(() => {
                    moveToSongScreen();
                }, 500);
            }
        }, 500);
    } else {
        isBlowing = false;
    }
}

// Move to song screen
function moveToSongScreen() {
    screens.greeting.classList.remove('active');
    screens.song.classList.add('active');
    
    if (recognition) {
        recognition.stop();
    }
    
    // Stop microphone stream
    if (microphoneStream) {
        microphoneStream.getTracks().forEach(track => track.stop());
        microphoneStream = null;
    }
    
    // Play happy birthday song after a small delay to ensure screen is visible
    setTimeout(() => {
        playHappyBirthday();
    }, 500);
    
    // After song starts playing, move to letter screen (song will continue in background)
    setTimeout(() => {
        moveToLetterScreen();
    }, 3000); // Quick transition to letter screen while song plays
}


// Play Happy Birthday song - instrumental melody only
function playHappyBirthday() {
    // Cancel any ongoing speech
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
    
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume audio context in case it was suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    // Happy Birthday melody - simple instrumental version
    const notes = [
        // Line 1: Happy Birthday to you
        { freq: 523.25, duration: 0.5 }, // C
        { freq: 523.25, duration: 0.25 }, // C
        { freq: 587.33, duration: 0.5 }, // D
        { freq: 523.25, duration: 0.5 }, // C
        { freq: 698.46, duration: 0.5 }, // F
        { freq: 659.25, duration: 1.0 }, // E
        
        // Line 2: Happy Birthday to you
        { freq: 523.25, duration: 0.5 }, // C
        { freq: 523.25, duration: 0.25 }, // C
        { freq: 587.33, duration: 0.5 }, // D
        { freq: 523.25, duration: 0.5 }, // C
        { freq: 783.99, duration: 0.5 }, // G
        { freq: 698.46, duration: 1.0 }, // F
        
        // Line 3: Happy Birthday dear Cielo
        { freq: 523.25, duration: 0.5 }, // C
        { freq: 523.25, duration: 0.25 }, // C
        { freq: 1046.50, duration: 0.5 }, // C (high)
        { freq: 880.00, duration: 0.5 }, // A
        { freq: 698.46, duration: 0.5 }, // F
        { freq: 659.25, duration: 0.5 }, // E
        { freq: 587.33, duration: 1.0 }, // D
        
        // Line 4: Happy Birthday to you
        { freq: 987.77, duration: 0.5 }, // B
        { freq: 987.77, duration: 0.25 }, // B
        { freq: 880.00, duration: 0.5 }, // A
        { freq: 698.46, duration: 0.5 }, // F
        { freq: 783.99, duration: 0.5 }, // G
        { freq: 698.46, duration: 1.5 }, // F (longer final note)
    ];
    
    // Play melody with Web Audio API - using multiple oscillators for richer sound
    let currentTime = audioContext.currentTime + 0.3;
    
    notes.forEach((note, index) => {
        // Create multiple oscillators for a richer, more musical sound
        // Main melody oscillator
        const oscillator1 = audioContext.createOscillator();
        const gainNode1 = audioContext.createGain();
        
        oscillator1.connect(gainNode1);
        gainNode1.connect(audioContext.destination);
        
        oscillator1.frequency.value = note.freq;
        oscillator1.type = 'sine'; // Sine wave for smooth, pleasant sound
        
        // Envelope for smooth attack and release
        gainNode1.gain.setValueAtTime(0, currentTime);
        gainNode1.gain.linearRampToValueAtTime(0.25, currentTime + 0.05);
        gainNode1.gain.setValueAtTime(0.25, currentTime + note.duration * 0.8);
        gainNode1.gain.linearRampToValueAtTime(0, currentTime + note.duration);
        
        oscillator1.start(currentTime);
        oscillator1.stop(currentTime + note.duration);
        
        // Add a subtle harmony oscillator for depth (octave below)
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        
        oscillator2.frequency.value = note.freq / 2; // Octave below
        oscillator2.type = 'sine';
        
        gainNode2.gain.setValueAtTime(0, currentTime);
        gainNode2.gain.linearRampToValueAtTime(0.08, currentTime + 0.05);
        gainNode2.gain.setValueAtTime(0.08, currentTime + note.duration * 0.8);
        gainNode2.gain.linearRampToValueAtTime(0, currentTime + note.duration);
        
        oscillator2.start(currentTime);
        oscillator2.stop(currentTime + note.duration);
        
        currentTime += note.duration;
    });
}

// Move to letter screen
function moveToLetterScreen() {
    screens.song.classList.remove('active');
    screens.letter.classList.add('active');
}

// Open letter
function openLetter() {
    const envelope = document.getElementById('envelope');
    const letterContent = document.getElementById('letter-content');
    const button = document.getElementById('open-letter-btn');
    const nextBtn = document.getElementById('next-btn');
    
    envelope.classList.add('opened');
    button.style.display = 'none';
    
    setTimeout(() => {
        letterContent.classList.add('revealed');
        // Show continue button after letter is revealed
        nextBtn.style.display = 'block';
    }, 500);
}

// Move to final screen
function moveToFinalScreen() {
    screens.letter.classList.remove('active');
    screens.final.classList.add('active');
}
