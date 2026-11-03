import welcomeIntro from './voice/K8dQ2vX7-shelter-angel-welcome-intro.wav';
import shelterAngel from './voice/N7qP4xK2-shelter-angel.wav';
import azureAngel from './voice/v5Kp9N3a-azure-angel.wav';
import fernAngel from './voice/J3cT7aQ8-fern-angel.wav';
import emberAngel from './voice/H6wD2qR9-ember-angel.wav';
import vesperAngel from './voice/P9fL4sM6-vesper-angel.wav';
import memoryAngel from './voice/x2N7bK5c-memory-angel.wav';
import memoryAngelLetter from './voice/wdhL3v1m-memory-angel-second-appearance.wav';

const TRACKS = Object.freeze({
  welcome: welcomeIntro,
  shelter: shelterAngel,
  azure: azureAngel,
  fern: fernAngel,
  ember: emberAngel,
  vesper: vesperAngel,
  memory: memoryAngel,
  memoryLetter: memoryAngelLetter
});

const players = typeof Audio === 'undefined'
  ? {}
  : Object.fromEntries(
    Object.entries(TRACKS).map(([name, source]) => {
      const audio = new Audio(source);
      audio.preload = 'auto';
      audio.volume = 0.88;
      audio.setAttribute('playsinline', '');
      return [name, audio];
    })
  );

let userGestureSeen = false;
let pendingQueue = [];
let sequenceId = 0;

const startQueue = (queue) => {
  const currentSequence = ++sequenceId;
  let index = 0;

  const playNext = () => {
    if (currentSequence !== sequenceId) return;
    if (index >= queue.length) return;

    const name = queue[index++];
    const audio = players[name];
    if (!audio) {
      playNext();
      return;
    }

    audio.onended = playNext;
    audio.onerror = playNext;
    try {
      audio.pause();
      audio.currentTime = 0;
      const playback = audio.play();
      playback?.catch?.(() => {
        if (currentSequence !== sequenceId) return;
        audio.onended = null;
        audio.onerror = null;
        pendingQueue = queue.slice(index - 1);
        userGestureSeen = false;
      });
    } catch {
      audio.onended = null;
      audio.onerror = null;
      pendingQueue = queue.slice(index - 1);
      userGestureSeen = false;
    }
  };

  playNext();
};

const onUserGesture = () => {
  userGestureSeen = true;
  if (!pendingQueue.length) return;
  const queued = pendingQueue;
  pendingQueue = [];
  startQueue(queued);
};

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', onUserGesture, true);
  document.addEventListener('keydown', onUserGesture, true);
}

export function playAngelVoice(names) {
  stopAngelVoice();
  const requested = Array.isArray(names) ? names : [names];
  const queue = requested.filter((name) => typeof name === 'string' && TRACKS[name]);
  if (!queue.length) return;

  if (!userGestureSeen) {
    pendingQueue = queue;
    return;
  }

  startQueue(queue);
}

export function stopAngelVoice() {
  sequenceId += 1;
  pendingQueue = [];
  for (const audio of Object.values(players)) {
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    try { audio.currentTime = 0; } catch { /* Ignore unloaded media. */ }
  }
}
