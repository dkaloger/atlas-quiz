// Loads the export (data/manifest.json and each atlas.json) and merges the classmate's changes over it.

import { store } from './store.js';

export const DATA = 'data';

async function json(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** "2 < 10 < 11 < 11a"; numbers without leading digits go last. */
export function compareNumbers(a, b) {
  const pa = /^(\d+)(.*)$/.exec(a), pb = /^(\d+)(.*)$/.exec(b);
  if (pa && pb) return Number(pa[1]) - Number(pb[1]) || pa[2].localeCompare(pb[2]);
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b);
}

function prepare(atlas, entry) {
  atlas.base = `${DATA}/${entry.path}`;
  atlas.plates.forEach((plate, index) => {
    plate.index = index;
    const edits = store.edits(atlas.id, plate.id);
    for (const label of plate.labels) {
      label.positions ||= [];
      label.spots ||= [];
      Object.assign(label, edits[label.number]);
    }
    plate.results = { ...plate.results, ...store.results(atlas.id, plate.id) };
    plate.ordered = [...plate.labels].sort((a, b) => compareNumbers(a.number, b.number));
  });
  return atlas;
}

/** { manifest, atlases: Map(id → atlas) } */
export async function loadLibrary() {
  const manifest = await json(`${DATA}/manifest.json`);
  const atlases = new Map();
  await Promise.all((manifest.atlases || []).map(async (entry) => {
    try {
      atlases.set(entry.id, prepare(await json(`${DATA}/${entry.path}/atlas.json`), entry));
    } catch (error) {
      console.warn('Atlas not loaded', entry.id, error);
    }
  }));
  return { manifest, atlases };
}

export const imageURL = (atlas, plate) => `${atlas.base}/${plate.imageFile}`;

export const figureName = (plate) => plate.name || `Εικ. ${plate.index + 1}`;

/** The figures a lecture uses (or all of them), in atlas order. */
export function shownPlates(atlas, figures) {
  if (!figures?.length) return atlas.plates;
  const picked = atlas.plates.filter((p) => figures.includes(p.id));
  return picked.length ? picked : atlas.plates;
}

/** Mode 1: each label, then its origin and insertion questions. */
export function nameSteps(plate) {
  return plate.ordered.flatMap((l) => [
    l.number,
    ...['origin', 'insertion'].filter((s) => l.spots.includes(s)).map((s) => `${l.number}@${s}`),
  ]);
}

/** Mode 2: each label that has a position. */
export function findSteps(plate) {
  return plate.ordered.filter((l) => l.positions.length).map((l) => `${l.number}@find`);
}

export function parseStep(key) {
  const at = key.lastIndexOf('@');
  if (at < 0) return { key, number: key, spot: null, find: false };
  const kind = key.slice(at + 1);
  return { key, number: key.slice(0, at), spot: kind === 'find' ? null : kind, find: kind === 'find' };
}

/** Known / total over mode-1 questions. */
export function progress(plates) {
  let known = 0, total = 0;
  for (const plate of plates) {
    for (const key of nameSteps(plate)) {
      total++;
      if (plate.results[key] === true) known++;
    }
  }
  return { known, total };
}

export function saveResult(atlas, plate, key, value) {
  if (value == null) delete plate.results[key];
  else plate.results[key] = value;
  store.saveResults(atlas.id, plate.id, plate.results);
}

export function saveLabel(atlas, plate, label, patch) {
  Object.assign(label, patch);
  store.saveEdit(atlas.id, plate.id, label.number, patch);
}
