// Everything a classmate changes lives in localStorage, never in the exported files.

const PREFIX = 'mq:';
const memory = new Map(); // used when localStorage is unavailable (private mode)

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw);
  } catch { /* fall through to memory */ }
  return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
  memory.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* full or blocked */ }
}

const plateKey = (atlasID, plateID, what) => `atlas:${atlasID}:${plateID}:${what}`;

export const store = {
  settings() {
    return { mode: 'name', scramble: false, sheetOpen: null, ...read('settings', {}) };
  },
  saveSettings(patch) {
    write('settings', { ...this.settings(), ...patch });
  },

  /** Latest answer per step key ("12", "12@origin", "12@find"). */
  results(atlasID, plateID) {
    return read(plateKey(atlasID, plateID, 'results'), {});
  },
  saveResults(atlasID, plateID, results) {
    write(plateKey(atlasID, plateID, 'results'), results);
  },

  /** Label changes by number: placed numbers, moved or added spots, "don't ask". */
  edits(atlasID, plateID) {
    return read(plateKey(atlasID, plateID, 'edits'), {});
  },
  saveEdit(atlasID, plateID, number, patch) {
    const all = this.edits(atlasID, plateID);
    all[number] = { ...all[number], ...patch };
    write(plateKey(atlasID, plateID, 'edits'), all);
  },

  /** The figure last open in an atlas, per lecture. */
  figure(atlasID, lectureID) {
    return read(`figure:${atlasID}:${lectureID || 'all'}`, null);
  },
  saveFigure(atlasID, lectureID, plateID) {
    write(`figure:${atlasID}:${lectureID || 'all'}`, plateID);
  },

  last() {
    return read('last', null);
  },
  saveLast(value) {
    write('last', value);
  },

  /** Backup file contents. */
  exportAll() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(PREFIX)) data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
      }
    } catch {
      for (const [k, v] of memory) data[k] = v;
    }
    return { app: 'MedStudy Atlas Web', version: 1, exportedAt: new Date().toISOString(), data };
  },
  /** Returns how many entries were restored; throws on a file that isn't a backup. */
  importAll(file) {
    if (!file || file.app !== 'MedStudy Atlas Web' || typeof file.data !== 'object') throw new Error('not a backup');
    let n = 0;
    for (const [k, v] of Object.entries(file.data)) { write(k, v); n++; }
    return n;
  },
};
