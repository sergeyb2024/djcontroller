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
  const syncToggleBtn = document.getElementById('sync-toggle');

  // --- MIXER SETUP ---
  const masterCrossfader = new Tone.CrossFade().toDestination();

  // Helper to update control status display
  const updateStatus = (id, val) => {
    const statusEl = document.getElementById(id + '-status');
    if (statusEl) statusEl.textContent = val;
  };

  // --- DECK SETUP ---
  const setupDeck = (deckId, channel) => {
    const deck = {};

    deck.playBtn = document.getElementById(`play-cue-${deckId}`);
    deck.rpmSlider = document.getElementById(`rpm-${deckId}`);
    deck.fileInput = document.getElementById(`file-input-${deckId}`);
    deck.turntable = document.getElementById(`turntable-${deckId}`);

    // Audio Nodes & Effects Chain
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

    // Drum synthesizers (4 voices)
    const drumNotes = ['C1', 'D1', 'F#1', 'A1'];
    deck.drumSynths = drumNotes.map(note =>
      new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6 }).connect(
        channel === 'a' ? masterCrossfader.a : masterCrossfader.b
      )
    );
    deck.synth = new Tone.PolySynth(Tone.Synth);

    // Grid states (4x4 for drums, 4x8 for synth)
    deck.drumGridState = Array.from({ length: 4 }, () => Array(4).fill(false));
    deck.synthGridState = Array.from({ length: 4 }, () => Array(8).fill(false));

    // Routing chain
    const destination = channel === 'a' ? masterCrossfader.a : masterCrossfader.b;
    deck.player.chain(
      deck.effects.reverb,
      deck.effects.flanger,
      deck.effects.tremolo,
      deck.effects.chorus,
      deck.effects.echo,
      deck.effects.pitch,
      deck.eq,
      deck.hpf,
      deck.lpf,
      destination
    );
    deck.synth.connect(destination);
    deck.drumSynths.forEach(synth => synth.connect(destination));

    // Sequencer note definitions
    const synthNotes = ['C5', 'A4', 'G4', 'E4'];

    // Create grid UI with toggle state
    setupGrid(`drum-machine-${deckId}`, 4, 4, deck.drumGridState);
    setupGrid(`synth-melodies-${deckId}`, 8, 4, deck.synthGridState);

    // Drum sequencer
    deck.drumSequencer = new Tone.Sequence((time, col) => {
      for (let row = 0; row < 4; row++) {
        if (deck.drumGridState[row][col]) {
          deck.drumSynths[row].triggerAttackRelease(drumNotes[row], '8n', time);
        }
      }
    }, [0, 1, 2, 3], '4n').start(0);

    // Synth sequencer
    deck.synthSequencer = new Tone.Sequence((time, col) => {
      const activeNotes = [];
      for (let row = 0; row < 4; row++) {
        if (deck.synthGridState[row][col]) {
          activeNotes.push(synthNotes[row]);
        }
      }
      if (activeNotes.length) {
        deck.synth.triggerAttackRelease(activeNotes, '8n', time);
      }
    }, Array.from({ length: 8 }, (_, i) => i), '8n').start(0);

    return deck;
  };

  const deckA = setupDeck('a', 'a');
  const deckB = setupDeck('b', 'b');

  // --- EVENT LISTENERS ---
  const setupEventListeners = (deck, deckId) => {
    // File input
    deck.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      deck.player.load(url).then(() => {
        console.log(`Track loaded for Deck ${deckId.toUpperCase()}`);
      });
    });

    deck.playBtn.addEventListener('click', () => {
      if (deck.player.loaded) {
        deck.player.state === 'started' ? deck.player.stop() : deck.player.start();
      }
    });

    // RPM Slider with status update
    deck.rpmSlider.addEventListener('input', (e) => {
      if (deck.player.loaded) deck.player.playbackRate = parseFloat(e.target.value);
      updateStatus(`rpm-${deckId}`, e.target.value);
    });
    updateStatus(`rpm-${deckId}`, deck.rpmSlider.value);

    // EQ Knobs with status update
    ['high', 'mid', 'low'].forEach(freq => {
      const el = document.getElementById(`${freq}-eq-${deckId}`);
      el.addEventListener('input', e => {
        deck.eq[freq].value = e.target.value;
        updateStatus(`${freq}-eq-${deckId}`, e.target.value);
      });
      updateStatus(`${freq}-eq-${deckId}`, el.value);
    });

    // Filter knobs with status update
    ['hpf', 'lpf'].forEach(filter => {
      const el = document.getElementById(`${filter}-${deckId}`);
      el.addEventListener('input', e => {
        deck[filter].frequency.value = e.target.value;
        updateStatus(`${filter}-${deckId}`, e.target.value);
      });
      updateStatus(`${filter}-${deckId}`, el.value);
    });

    // Effect knobs with status update
    document.querySelectorAll(`.effect-knob[data-deck="${deckId}"]`).forEach(knob => {
      const effectName = knob.dataset.effect;
      knob.addEventListener('input', e => {
        const value = e.target.value;
        if (effectName === 'pitch') {
          deck.effects.pitch.pitch = Number(value);
        } else {
          deck.effects[effectName].wet.value = Number(value);
        }
        updateStatus(`${effectName}-${deckId}`, value);
      });
      updateStatus(`${effectName}-${deckId}`, knob.value);
    });

    // Turntable scratch interaction
    let lastAngle = 0;
    let isDragging = false;
    deck.turntable.addEventListener('mousedown', () => {
      if (deck.player.loaded) isDragging = true;
    });
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

  // Crossfader with status
  crossfader.addEventListener('input', (e) => {
    masterCrossfader.fade.value = parseFloat(e.target.value);
    updateStatus('crossfader', Number(e.target.value).toFixed(2));
  });
  updateStatus('crossfader', Number(crossfader.value).toFixed(2));

  // Master play button
  masterPlayBtn.addEventListener('click', () => {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.stop();
      masterPlayBtn.textContent = 'Play Sequencers';
    } else {
      Tone.Transport.start();
      masterPlayBtn.textContent = 'Stop Sequencers';
    }
  });

  // Sync feature: sync/unsync deck B to deck A's BPM and Transport position
  let decksSynced = false;
  syncToggleBtn.addEventListener('click', () => {
    decksSynced = !decksSynced;
    syncToggleBtn.textContent = decksSynced ? 'Unsync Decks' : 'Sync Decks';

    if (decksSynced) {
      // Sync BPM & position
      Tone.Transport.bpm.value = 120; // or set from deckA bpm or slider if you add one
      // Sync deckB sequencers to deckA sequencers position
      joinDecksTransport();
      console.log('Decks synced');
    } else {
      console.log('Decks unsynced');
    }
  });

  function joinDecksTransport() {
    // Sync transport position of deckB sequencers to deckA
    // Stop deckB sequencers so they follow transport instead of independent
    deckB.drumSequencer.stop();
    deckB.synthSequencer.stop();

    // Start the same time as deckA, synced to Tone.Transport
    deckB.drumSequencer.start(0);
    deckB.synthSequencer.start(0);
  }

  // --- GRID UI SETUP AND HIGHLIGHTING ---
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
          stateArray[row][col] = !stateArray[row][col];
          pad.classList.toggle('active');
        });
        grid.appendChild(pad);
      }
    }
  }

  new Tone.Loop(time => {
    Tone.Draw.schedule(() => {
      highlightStep('drum-machine-a', Math.floor(deckA.drumSequencer.progress * 4));
      highlightStep('synth-melodies-a', Math.floor(deckA.synthSequencer.progress * 8));
      highlightStep('drum-machine-b', Math.floor(deckB.drumSequencer.progress * 4));
      highlightStep('synth-melodies-b', Math.floor(deckB.synthSequencer.progress * 8));
    }, time);
  }, '16n').start(0);

  function highlightStep(gridId, step) {
    document.getElementById(gridId).querySelectorAll('.pad').forEach(pad => {
      pad.classList.toggle('playing', parseInt(pad.dataset.col) === step);
    });
  }

  // --- RECORDING & MP3 EXPORT ---
  let recorder, audioChunks = [];
  const dest = Tone.context.createMediaStreamDestination();
  Tone.getDestination().connect(dest);
  recorder = new MediaRecorder(dest.stream);

  recordBtn.addEventListener('click', () => {
    if (recorder.state === 'recording') {
      recorder.stop();
      recordBtn.textContent = 'Record';
      recordBtn.classList.remove('recording');
    } else {
      audioChunks = [];
      recorder.start();
      recordBtn.textContent = 'Stop Recording';
      recordBtn.classList.add('recording');
      saveBtn.style.display = 'none';
    }
  });

  recorder.ondataavailable = e => {
    if (e.data.size > 0) {
      audioChunks.push(e.data);
      console.log('Data available chunk size:', e.data.size);
    }
  };

  recorder.onerror = e => {
    console.error('Recorder error:', e.error);
  };

  recorder.onstop = () => {
    if (audioChunks.length === 0) {
      alert('No audio recorded!');
      saveBtn.style.display = 'none';
      recordBtn.textContent = 'Record';
      return;
    }
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    saveBtn.textContent = "Processing...";
    saveBtn.classList.add("disabled");
    saveBtn.style.display = 'inline-block';

    const reader = new FileReader();
    reader.onload = (event) => {
      Tone.context.decodeAudioData(event.target.result,
        audioBuffer => {
          try {
            const mp3encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
            const samples = audioBuffer.getChannelData(0);
            const mp3Data = [];
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

            const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });

            const url = URL.createObjectURL(mp3Blob);
            saveBtn.href = url;
            saveBtn.download = `dj-creation-${Date.now()}.mp3`;
            saveBtn.textContent = 'Save MP3';
            saveBtn.classList.remove("disabled");
            console.log('MP3 ready for download');
          } catch (err) {
            console.error('MP3 encoding error:', err);
            saveBtn.textContent = 'MP3 encoding failed';
            saveBtn.classList.remove("disabled");
          }
        },
        error => {
          console.error('decodeAudioData error:', error);
          saveBtn.textContent = 'Decode error';
          saveBtn.classList.remove("disabled");
        }
      );
    };
    reader.readAsArrayBuffer(audioBlob);
  };

  // --- HEADPHONE CUE FUNCTION ---
  window.cueDeck = (id) => {
    const deck = id === 'a' ? deckA : deckB;
    deck.player.mute = !deck.player.mute;
    console.log(`Headphone Cue for Deck ${id.toUpperCase()}: ${deck.player.mute ? 'MUTED' : 'ACTIVE'}`);
  };
}
