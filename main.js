document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const djController = document.getElementById('dj-controller');
    const startOverlay = document.getElementById('start-overlay');

    startButton.addEventListener('click', async () => {
        try {
            await Tone.start();
            console.log('Audio Context is ready.');
            startOverlay.style.display = 'none';
            djController.style.display = 'flex';
            initializeApp();
        } catch (e) {
            console.error('Could not start Audio Context:', e);
            alert('This browser does not support the Web Audio API.');
        }
    });
});

function initializeApp() {
    // --- GLOBAL ELEMENTS ---
    const masterPlayBtn = document.getElementById('master-play');
    const crossfader = document.getElementById('crossfader');
    const recordBtn = document.getElementById('record-button');
    const saveBtn = document.getElementById('save-button');

    // --- MIXER SETUP ---
    const masterCrossfader = new Tone.CrossFade().toDestination();

    // --- DECK SETUP ---
    const setupDeck = (deckId, channel) => {
        const deck = {};
        deck.playBtn = document.getElementById(`play-cue-${deckId}`);
        deck.rpmSlider = document.getElementById(`rpm-${deckId}`);
        deck.fileInput = document.getElementById(`file-input-${deckId}`);
        deck.turntable = document.getElementById(`turntable-${deckId}`);

        // Audio Nodes
        deck.player = new Tone.Player({ fadeIn: 0.1, fadeOut: 0.1 });
        deck.eq = new Tone.EQ3(0, 0, 0);
        deck.hpf = new Tone.Filter(0, 'highpass');
        deck.lpf = new Tone.Filter(20000, 'lowpass');
        deck.effects = {
            reverb: new Tone.Reverb({ decay: 1.5, wet: 0 }),
            flanger: new Tone.Chorus({ frequency: 0.5, delayTime: 3, depth: 0.7, feedback: 0.5, wet: 0 }),
            tremolo: new Tone.Tremolo(9, 0.75).start(),
            chorus: new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0 }),
            echo: new Tone.FeedbackDelay('8n', 0.5),
            pitch: new Tone.PitchShift({ pitch: 0, wet: 1 }),
        };
        deck.effects.tremolo.wet.value = 0;
        deck.effects.echo.wet.value = 0;

        // Instruments
        deck.drumSynths = []
        deck.synth = new Tone.PolySynth(Tone.Synth);
        
        // State Arrays
        deck.drumGridState = Array(4).fill(null).map(() => Array(4).fill(false));
        deck.synthGridState = Array(4).fill(null).map(() => Array(8).fill(false));

        // --- ROUTING ---
        const destination = channel === 'a'? masterCrossfader.a : masterCrossfader.b;
        deck.player.chain(deck.effects.reverb, deck.effects.flanger, deck.effects.tremolo, deck.effects.chorus, deck.effects.echo, deck.effects.pitch, deck.eq, deck.hpf, deck.lpf, destination);
        deck.drumSynths.forEach(s => s.connect(destination));
        deck.synth.connect(destination);

        // --- SEQUENCERS ---
        const drumNotes = ['C1', 'C2', 'C3', 'C4'];
        const synthNotes = ['C5', 'A4', 'G4', 'E4'];

        setupGrid(`drum-machine-${deckId}`, 4, 4, deck.drumGridState);
        setupGrid(`synth-melodies-${deckId}`, 8, 4, deck.synthGridState);

        deck.drumSequencer = new Tone.Sequence((time, col) => {
            for (let row = 0; row < 4; row++) {
                if (deck.drumGridState[row][col]) {
                    if (row === 1) deck.drumSynths[row].triggerAttackRelease('8n', time);
                    else deck.drumSynths[row].triggerAttackRelease(drumNotes[row], '8n', time);
                }
            }
        }, Array.from(Array(4).keys()), '4n').start(0);

        deck.synthSequencer = new Tone.Sequence((time, col) => {
            const activeNotes = []
            for (let row = 0; row < 4; row++) {
                if (deck.synthGridState[row][col]) {
                    activeNotes.push(synthNotes[row]);
                }
            }
            if (activeNotes.length > 0) {
                deck.synth.triggerAttackRelease(activeNotes, '8n', time);
            }
        }, Array.from(Array(8).keys()), '8n').start(0);

        return deck;
    };

    const deckA = setupDeck('a', 'a');
    const deckB = setupDeck('b', 'b');

    // --- EVENT LISTENERS ---
    const setupEventListeners = (deck, deckId) => {
        deck.fileInput.addEventListener('change', (e) => {
            const file = e.target.files;
            if (file) {
                const url = URL.createObjectURL(file);
                deck.player.load(url).then(() => console.log(`Track loaded for Deck ${deckId.toUpperCase()}`));
            }
        });

        deck.playBtn.addEventListener('click', () => {
            if (deck.player.loaded) {
                deck.player.state === 'started'? deck.player.stop() : deck.player.start();
            }
        });

        deck.rpmSlider.addEventListener('input', (e) => {
            if (deck.player.loaded) deck.player.playbackRate = parseFloat(e.target.value);
        });

        document.getElementById(`high-eq-${deckId}`).addEventListener('input', (e) => deck.eq.high.value = e.target.value);
        document.getElementById(`mid-eq-${deckId}`).addEventListener('input', (e) => deck.eq.mid.value = e.target.value);
        document.getElementById(`low-eq-${deckId}`).addEventListener('input', (e) => deck.eq.low.value = e.target.value);
        document.getElementById(`hpf-${deckId}`).addEventListener('input', (e) => deck.hpf.frequency.value = e.target.value);
        document.getElementById(`lpf-${deckId}`).addEventListener('input', (e) => deck.lpf.frequency.value = e.target.value);

        document.querySelectorAll(`.effect-knob[data-deck="${deckId}"]`).forEach(knob => {
            knob.addEventListener('input', (e) => {
                const effectName = e.target.dataset.effect;
                const value = parseFloat(e.target.value);
                if (effectName === 'pitch') {
                    deck.effects.pitch.pitch = value;
                } else {
                    deck.effects[effectName].wet.value = value;
                }
            });
        });

        let lastAngle = 0;
        let isDragging = false;
        deck.turntable.addEventListener('mousedown', () => { if (deck.player.loaded) isDragging = true; });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                deck.player.playbackRate = deck.rpmSlider.value;
            }
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const rect = deck.turntable.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
                const deltaAngle = angle - lastAngle;
                deck.player.playbackRate = Math.max(0.01, 1 + deltaAngle * 5);
                lastAngle = angle;
            }
        });
    };

    setupEventListeners(deckA, 'a');
    setupEventListeners(deckB, 'b');

    crossfader.addEventListener('input', (e) => masterCrossfader.fade.value = e.target.value);

    masterPlayBtn.addEventListener('click', () => {
        if (Tone.Transport.state === 'started') {
            Tone.Transport.stop();
            masterPlayBtn.textContent = 'Play Sequencers';
        } else {
            Tone.Transport.start();
            masterPlayBtn.textContent = 'Stop Sequencers';
        }
    });

    // --- UI HELPER ---
    function setupGrid(gridId, cols, rows, stateArray) {
        const grid = document.getElementById(gridId);
        grid.innerHTML = '';
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const pad = document.createElement('div');
                pad.classList.add('pad');
                pad.dataset.row = row;
                pad.dataset.col = col;
                pad.addEventListener('click', () => {
                    stateArray[row][col] =!stateArray[row][col];
                    pad.classList.toggle('active');
                });
                grid.appendChild(pad);
            }
        }
    }

    new Tone.Loop(time => {
        Tone.Draw.schedule(() => {
            highlightStep('drum-machine-a', deckA.drumSequencer.progress * 4 | 0);
            highlightStep('synth-melodies-a', deckA.synthSequencer.progress * 8 | 0);
            highlightStep('drum-machine-b', deckB.drumSequencer.progress * 4 | 0);
            highlightStep('synth-melodies-b', deckB.synthSequencer.progress * 8 | 0);
        }, time);
    }, '16n').start(0);

    function highlightStep(gridId, step) {
        document.getElementById(gridId).querySelectorAll('.pad').forEach(pad => {
            if (parseInt(pad.dataset.col) === step) {
                pad.classList.add('playing');
            } else {
                pad.classList.remove('playing');
            }
        });
    }

    // --- RECORDING & MP3 EXPORT ---
    let recorder, audioChunks = []
    const dest = Tone.context.createMediaStreamDestination();
    Tone.getDestination().connect(dest);
    recorder = new MediaRecorder(dest.stream);

    recordBtn.addEventListener('click', () => {
        if (recorder.state === 'recording') {
            recorder.stop();
            recordBtn.textContent = 'Record';
            recordBtn.classList.remove('recording');
        } else {
            audioChunks = []
            recorder.start();
            recordBtn.textContent = 'Stop Recording';
            recordBtn.classList.add('recording');
            saveBtn.style.display = 'none';
        }
    });

    recorder.ondataavailable = e => audioChunks.push(e.data);

    recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        saveBtn.textContent = "Processing...";
        saveBtn.classList.add("disabled");
        saveBtn.style.display = 'inline-block';

        const reader = new FileReader();
        reader.onload = (event) => {
            Tone.context.decodeAudioData(event.target.result, (audioBuffer) => {
                const mp3encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
                const samples = audioBuffer.getChannelData(0);
                const mp3Data = []
                const sampleBlockSize = 1152;

                for (let i = 0; i < samples.length; i += sampleBlockSize) {
                    const sampleChunk = samples.subarray(i, i + sampleBlockSize);
                    const int16Chunk = new Int16Array(sampleChunk.length);
                    for (let j = 0; j < sampleChunk.length; j++) {
                        int16Chunk[j] = sampleChunk[j] * 32767;
                    }
                    const mp3buf = mp3encoder.encodeBuffer(int16Chunk);
                    if (mp3buf.length > 0) mp3Data.push(mp3buf);
                }
                const end = mp3encoder.flush();
                if (end.length > 0) mp3Data.push(end);

                const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
                const url = URL.createObjectURL(mp3Blob);
                
                saveBtn.href = url;
                saveBtn.download = `dj-creation-${Date.now()}.mp3`;
                saveBtn.textContent = 'Save MP3';
                saveBtn.classList.remove("disabled");
            });
        };
        reader.readAsArrayBuffer(audioBlob);
    };
}