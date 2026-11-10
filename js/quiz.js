// The quiz screen: the figure on one side, the question panel on the other (or a bottom sheet).

import { store } from './store.js';
import { Viewer } from './viewer.js';
import { highlight } from './text.js';
import { esc, html, icon, vibrate, clamp } from './util.js';
import { shownPlates, figureName, imageURL, nameSteps, findSteps, parseStep, saveResult, saveLabel } from './data.js';

const SPOT = {
  origin: { name: 'απόφυση', stem: 'αποφύ' },
  insertion: { name: 'κατάφυση', stem: 'καταφύ' },
};
const TAG_FONT = '600 11px Commissioner, system-ui, -apple-system, "Segoe UI", sans-serif';
const SVG_NS = 'http://www.w3.org/2000/svg';
const UNDO_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z';

/** Shuffles the questions, keeping a number's origin/insertion right after its name. */
function scrambled(keys) {
  const groups = [];
  for (const key of keys) {
    const number = parseStep(key).number;
    const last = groups[groups.length - 1];
    if (last && parseStep(last[0]).number === number) last.push(key);
    else groups.push([key]);
  }
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  return groups.flat();
}

let measurer;
function textWidth(text) {
  measurer ||= document.createElement('canvas').getContext('2d');
  measurer.font = TAG_FONT;
  return measurer.measureText(text).width;
}

export function mountQuiz(host, { atlas, lectureID, lectureTitle, figures, onBack }) {
  const plates = shownPlates(atlas, figures);
  const settings = store.settings();

  let mode = settings.mode === 'find' ? 'find' : 'name';
  let scramble = !!settings.scramble;
  let showAll = false;
  let plate = null;
  let queue = [];           // this round's step keys, in order
  let pos = 0;
  let answers = {};         // this round: step key → knew it
  let known = new Set();    // shown as known from the start (a "repeat the red ones" round)
  let placed = false;       // the asked number was placed during this question: a tap moves it
  let guess = null;         // the tap for the origin/insertion being asked
  let coarse = matchMedia('(pointer: coarse)').matches;
  let passage = null;       // { number, by: 'hover' | 'touch' }
  let hoverPoint = null;
  let hoverTimer = 0;
  let shownStep = null;
  let sheetOpen = settings.sheetOpen;
  const tagNodes = new Map();

  const root = html`
    <div class="quiz">
      <div class="fig">
        <div class="viewer"></div>
        <div class="fig-top">
          <button class="glass round" data-act="back" aria-label="Πίσω στη λίστα" title="Πίσω">${icon.back}</button>
          <div class="glass chip"></div>
        </div>
        <div class="passage" hidden></div>
        <div class="glass zoom" role="group" aria-label="Μεγέθυνση">
          <button data-act="zout" aria-label="Σμίκρυνση" title="Σμίκρυνση">${icon.minus}</button>
          <button data-act="zfit" aria-label="Ολόκληρη σελίδα" title="Ολόκληρη σελίδα">${icon.fit}</button>
          <button data-act="zin" aria-label="Μεγέθυνση" title="Μεγέθυνση">${icon.plus}</button>
        </div>
      </div>
      <aside class="panel">
        <div class="grip-row">
          <button class="grip-undo" data-act="undo" aria-label="Αναίρεση" title="Αναίρεση">${icon.undo}</button>
          <div class="grip" role="button" tabindex="0" aria-label="Άνοιγμα ή κλείσιμο του πίνακα"><i></i></div>
          <div class="grip-count"></div>
        </div>
        <div class="panel-scroll">
          <section class="p-head">
            <div class="p-title"></div>
            <label class="switch"><span>Εμφάνιση όλων</span><input type="checkbox" data-in="showall"><i></i></label>
          </section>
          <section class="p-mode">
            <div class="seg" role="radiogroup" aria-label="Τρόπος">
              <span class="seg-thumb"></span>
              <button role="radio" data-mode="name">Ονόμασε τον αριθμό</button>
              <button role="radio" data-mode="find">Βρες τον αριθμό</button>
            </div>
          </section>
          <section class="p-opts">
            <label class="check"><input type="checkbox" data-in="scramble"><i>${icon.check}</i><span>Τυχαία σειρά</span></label>
            <div class="select-wrap"><select aria-label="Εικόνα"></select></div>
          </section>
          <section class="p-progress">
            <div class="bar"><i></i></div>
            <div class="tally">
              <span class="count"></span>
              <span class="ok">${icon.check}<b></b></span>
              <span class="bad">${icon.cross}<b></b></span>
            </div>
          </section>
          <section class="p-card"></section>
          <section class="p-prev"></section>
        </div>
      </aside>
    </div>`;
  host.replaceChildren(root);

  const $ = (sel) => root.querySelector(sel);
  const fig = $('.fig'), panel = $('.panel'), scroller = $('.panel-scroll');
  const card = $('.p-card'), prev = $('.p-prev'), passageBox = $('.passage'), select = $('select');

  const viewer = new Viewer($('.viewer'), {
    tap: onTap,
    longPress: onLongPress,
    hover: (p) => { hoverPoint = p; drawCursor(); },
    scale: () => layoutTags(),
  });

  // ---- State helpers

  const step = () => (pos < queue.length ? parseStep(queue[pos]) : null);
  const labelOf = (number) => plate.labels.find((l) => l.number === number);
  const current = () => { const s = step(); return s ? labelOf(s.number) : null; };
  const finished = () => queue.length > 0 && pos >= queue.length;
  const needsPlacing = () => { const s = step(); return !!s && !s.spot && !s.find && current()?.positions.length === 0; };
  const needsSpotTap = () => !!step()?.spot && guess == null;
  const awaitingTap = () => needsPlacing() || needsSpotTap();
  const keyFor = (number) => (mode === 'find' ? `${number}@find` : number);
  const lastKey = () => (pos > 0 && pos - 1 < queue.length ? queue[pos - 1] : null);
  const canMarkPreviousWrong = () => (awaitingTap() || finished()) && answers[lastKey()] === true;
  const accepted = (label, spot) =>
    [label[spot], ...(label[spot === 'origin' ? 'alsoOrigins' : 'alsoInsertions'] || [])].filter(Boolean);
  const nearest = (points, p) => Math.min(Infinity, ...points.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
  /** The circle shown where a tap is wanted: for an origin/insertion, or for a number. */
  const wanted = () => {
    const s = step();
    if (!s || finished()) return null;
    if (s.spot) return 'spot';
    return s.find || needsPlacing() || placed ? 'number' : null;
  };

  // ---- Rounds

  function startRound(missedOnly) {
    const all = mode === 'find' ? findSteps(plate) : nameSteps(plate);
    if (missedOnly) {
      const missed = new Set(all.filter((k) => answers[k] === false || (answers[k] === undefined && plate.results[k] === false)));
      known = new Set(all.filter((k) => !missed.has(k)));
      queue = all.filter((k) => missed.has(k));
    } else {
      known = new Set();
      queue = all;
    }
    if (scramble) queue = scrambled(queue);
    answers = {};
    pos = 0; placed = false; guess = null;
    update();
    follow();
  }

  function setPlate(next, { round = true } = {}) {
    plate = next;
    store.saveFigure(atlas.id, lectureID, plate.id);
    store.saveLast({ atlasID: atlas.id, lectureID: lectureID || null, open: true });
    closePassage();
    for (const node of tagNodes.values()) { node.tag.remove(); node.line.remove(); }
    tagNodes.clear();
    select.value = plate.id;
    $('.chip').textContent = figureName(plate);
    viewer.reset();
    viewer.load(imageURL(atlas, plate)).then((ok) => { if (ok) follow(); });
    const after = plates[plates.indexOf(plate) + 1];
    if (after) new Image().src = imageURL(atlas, after);
    if (round) startRound(false);
  }

  function answer(knewIt) {
    // While a tap is still wanted (or the round is over), X takes back the previous "I know it".
    if (awaitingTap() || finished()) {
      if (!knewIt) markPreviousWrong();
      else if (!finished()) nudge();
      return;
    }
    const s = step();
    if (!s) return;
    answers[s.key] = knewIt;
    saveResult(atlas, plate, s.key, knewIt);
    placed = false; guess = null;
    pos += 1;
    update();
    follow();
  }

  function markPreviousWrong() {
    if (!canMarkPreviousWrong()) return;
    const key = lastKey();
    answers[key] = false;
    saveResult(atlas, plate, key, false);
    update();
  }

  function undo() {
    if (pos <= 0) return;
    pos -= 1;
    delete answers[queue[pos]];
    placed = false; guess = null;
    update();
    follow();
  }

  /** Centres the view on the number asked (never in Find mode: that would give it away). */
  function follow() {
    const s = step(), label = current();
    if (!s || s.find || !label?.positions.length) return;
    viewer.centerOn(label.positions[0][0], label.positions[0][1]);
  }

  // ---- Taps on the figure

  function onTap(e) {
    if (passage) { closePassage(); if (e.pointerType === 'touch') return; }
    const s = step(), label = current();
    if (!e.inside || !s || !label || finished()) return;
    const point = [e.x, e.y];
    const touch = e.pointerType === 'touch';
    if (s.find) {
      if (touch) viewer.flash(e.vx, e.vy, 'number');
      const { pw, ph } = viewer.metrics();
      const distance = (l) => Math.min(Infinity, ...l.positions.map((p) => Math.hypot((p[0] - e.x) * pw, (p[1] - e.y) * ph)));
      let best = null;
      for (const l of plate.labels) if (l.positions.length && (!best || distance(l) < distance(best))) best = l;
      answer(best === label && distance(label) < (touch ? 48 : 40));
      return;
    }
    if (s.spot) {
      if (touch) viewer.flash(e.vx, e.vy, 'spot');
      // The first tap is the guess (and, the first time ever, the saved answer); another moves the saved spot.
      if (guess != null || label[s.spot] == null) saveLabel(atlas, plate, label, { [s.spot]: point });
      guess = point;
      update();
      return;
    }
    if (!(needsPlacing() || placed || e.altKey)) return;
    if (touch) viewer.flash(e.vx, e.vy, 'number');
    place(label, point);
  }

  function onLongPress(e) {
    const tag = e.target?.closest?.('.tag');
    if (tag) { vibrate(); openPassage(tag.dataset.number, 'touch'); return; }
    const s = step(), label = current();
    if (!e.inside || !s || s.find || s.spot || !label || finished() || !label.positions.length) return;
    vibrate();
    viewer.flash(e.vx, e.vy, 'number');
    place(label, [e.x, e.y]);
  }

  function place(label, point) {
    saveLabel(atlas, plate, label, { positions: [point], exact: true });
    placed = true;
    update();
  }

  function alsoCorrect() {
    const s = step(), label = current();
    if (!s?.spot || !label || !guess) return;
    const field = s.spot === 'origin' ? 'alsoOrigins' : 'alsoInsertions';
    saveLabel(atlas, plate, label, { [field]: [...(label[field] || []), guess] });
    answer(true);
  }

  /** "Don't ask": no origin/insertion questions for this label, now or in later rounds. */
  function stopAskingSpots() {
    const label = current();
    if (!label) return;
    saveLabel(atlas, plate, label, { spots: [] });
    const mine = (k) => { const s = parseStep(k); return s.number === label.number && !!s.spot; };
    for (const key of queue.filter(mine)) saveResult(atlas, plate, key, null);
    queue = [...queue.slice(0, pos), ...queue.slice(pos).filter((k) => !mine(k))];
    placed = false; guess = null;
    update();
    follow();
  }

  // ---- Drawing on the figure

  function drawMarks() {
    const s = step(), label = current();
    let out = '';
    if (s && label && !finished() && !s.find) {
      for (const p of label.positions) {
        out += `<div class="ring${s.spot ? ' small' : ''}" style="left:${p[0] * 100}%;top:${p[1] * 100}%"></div>`;
      }
      if (s.spot && guess) {
        const right = accepted(label, s.spot);
        for (const p of right) out += `<div class="spot" style="left:${p[0] * 100}%;top:${p[1] * 100}%"></div>`;
        if (nearest(right, guess) >= 0.001) out += `<div class="guess" style="left:${guess[0] * 100}%;top:${guess[1] * 100}%"></div>`;
      }
    }
    if (viewer.marks.dataset.sig !== out) {
      viewer.marks.dataset.sig = out;
      viewer.marks.innerHTML = out;
    }
    viewer.focus = s && !s.spot && !s.find && !finished() && label?.positions.length ? label.positions[0] : null;
  }

  /** Each name next to its number without covering another: right, left, above, below, then further out. */
  function layoutTags() {
    const pw = viewer.lastPW, ph = viewer.lastPH;
    if (!plate || !pw) return;
    const taken = [];
    const seen = new Set();
    const hits = (a, b) => a.x - 2 < b.x + b.w && a.x + a.w + 2 > b.x && a.y - 1 < b.y + b.h && a.y + a.h + 1 > b.y;
    for (const label of plate.ordered) {
      const key = keyFor(label.number);
      if (!label.positions.length || !(showAll || answers[key] !== undefined || known.has(key))) continue;
      seen.add(label.number);
      const ax = label.positions[0][0] * pw, ay = label.positions[0][1] * ph;
      const w = Math.min(Math.ceil(textWidth(label.name)) + 12, 220), h = 18;
      let frame = null;
      search: for (let i = 0; i < 6; i++) {
        const d = 14 + i * 12;
        const options = [
          [ax + d, ay - h / 2], [ax - d - w, ay - h / 2], [ax - w / 2, ay - d - h],
          [ax - w / 2, ay + d], [ax + d, ay - h / 2 - d], [ax + d, ay - h / 2 + d],
        ];
        for (const [x, y] of options) {
          const option = { x, y, w, h };
          if (x >= 0 && y >= 0 && x + w <= pw && y + h <= ph && !taken.some((t) => hits(t, option))) { frame = option; break search; }
        }
      }
      frame ||= { x: Math.max(0, Math.min(ax + 14, pw - w)), y: clamp(ay - h / 2, 0, Math.max(0, ph - h)), w, h };
      taken.push(frame);

      let node = tagNodes.get(label.number);
      if (!node) {
        const tag = document.createElement('div');
        tag.dataset.number = label.number;
        const line = document.createElementNS(SVG_NS, 'line');
        viewer.tags.append(tag);
        viewer.leaders.append(line);
        tagNodes.set(label.number, (node = { tag, line }));
      }
      const state = answers[key] !== undefined ? (answers[key] ? 'ok' : 'bad') : known.has(key) ? 'ok' : 'idle';
      node.tag.className = `tag ${state}`;
      node.line.setAttribute('class', state);
      if (node.tag.textContent !== label.name) node.tag.textContent = label.name;
      node.tag.style.cssText = `left:${frame.x}px;top:${frame.y}px;width:${w}px`;
      node.line.setAttribute('x1', ax); node.line.setAttribute('y1', ay);
      node.line.setAttribute('x2', frame.x < ax ? frame.x + w : frame.x);
      node.line.setAttribute('y2', frame.y + h / 2);
    }
    for (const [number, node] of tagNodes) {
      if (!seen.has(number)) { node.tag.remove(); node.line.remove(); tagNodes.delete(number); }
    }
  }

  function drawCursor() {
    const kind = wanted();
    viewer.root.classList.toggle('want-tap', !!kind);
    const ring = viewer.cursor;
    if (!hoverPoint || !kind) { ring.hidden = true; return; }
    ring.hidden = false;
    ring.className = `cursor-ring k-${kind}`;
    ring.style.transform = `translate(${hoverPoint.x}px, ${hoverPoint.y}px)`;
  }

  // ---- The book's passage

  function openPassage(number, by) {
    const label = labelOf(number);
    if (!label) return;
    passage = { number, by };
    passageBox.innerHTML = `
      <div class="passage-head"><b>${esc(label.number)}</b><span>${esc(label.name)}</span></div>
      ${label.context
        ? `<p>${highlight(label.context, label.number, label.name)}</p>`
        : '<p class="none">Δεν υπάρχει αποθηκευμένο απόσπασμα για αυτόν τον άτλαντα.</p>'}`;
    passageBox.hidden = false;
    void passageBox.offsetWidth;
    passageBox.classList.add('open');
  }

  function closePassage() {
    clearTimeout(hoverTimer);
    if (!passage) return;
    passage = null;
    passageBox.classList.remove('open');
    passageBox.hidden = true;
  }

  /** Desktop: rest the pointer on a name for a second. */
  function hoverName(e, entering) {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const el = e.target.closest?.('[data-number]');
    if (!el) return;
    if (entering) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => openPassage(el.dataset.number, 'hover'), 1000);
    } else if (!el.contains(e.relatedTarget)) {
      clearTimeout(hoverTimer);
      if (passage?.by === 'hover' && passage.number === el.dataset.number) closePassage();
    }
  }

  // ---- The panel

  const kbd = (k) => `<kbd>${k}</kbd>`;
  const tapHint = (text) => `<p class="hint">${icon.tap}<span>${text}</span></p>`;
  const answerButtons = (yes, no, disabled) => `
    <div class="answers">
      <button class="btn ok" data-act="know" ${disabled ? 'disabled' : ''}><span>${yes}</span>${kbd('Z')}</button>
      <button class="btn bad" data-act="dont" ${disabled ? 'disabled' : ''}><span>${no}</span>${kbd('X')}</button>
    </div>`;

  function cardHTML() {
    const s = step(), label = current();
    const tap = coarse ? 'Άγγιξε' : 'Κάνε κλικ', tapLow = coarse ? 'άγγιξε' : 'κάνε κλικ';
    if (!queue.length) {
      return `<p class="kicker">Βρες τον αριθμό</p>
        <p class="note">Κανένας αριθμός αυτής της εικόνας δεν έχει τοποθετηθεί ακόμη. Πέρνα την πρώτα μία φορά με το «Ονόμασε τον αριθμό».</p>`;
    }
    if (finished()) {
      const missed = queue.filter((k) => answers[k] === false).length;
      const next = plates[plates.indexOf(plate) + 1];
      const share = (queue.length - missed) / queue.length;
      return `
        <div class="done">
          <svg class="done-ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="18"/><circle class="arc" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${(share * 100).toFixed(1)} 100"/>
          </svg>
          <div><h2>${missed ? 'Τέλος' : 'Τα ήξερες όλα!'}</h2><p>${queue.length - missed} από ${queue.length} γνωστά.</p></div>
        </div>
        <div class="stack">
          ${missed ? `<button class="btn bad wide" data-act="repeat">${icon.repeat}<span>Επανάληψη ${missed === 1 ? 'του 1 κόκκινου' : `των ${missed} κόκκινων`}</span></button>` : ''}
          <button class="btn plain wide" data-act="restart">${icon.repeat}<span>Από την αρχή</span></button>
          ${next ? `<button class="btn ${missed ? 'plain' : 'accent'} wide" data-act="next"><span>Επόμενη εικόνα · ${esc(figureName(next))}</span>${icon.next}</button>` : ''}
        </div>`;
    }
    if (s.find) {
      const skipped = plate.labels.filter((l) => !l.positions.length).length;
      return `
        <p class="kicker">Πού είναι</p>
        <div class="q-name big">${esc(label.name)}</div>
        ${tapHint(`${tap} στον αριθμό του πάνω στην εικόνα`)}
        <div class="answers one"><button class="btn bad" data-act="dont"><span>Δεν το ξέρω</span>${kbd('X')}</button></div>
        ${skipped ? `<p class="fine">${skipped === 1
          ? '1 αριθμός που δεν έχει τοποθετηθεί ακόμη στην εικόνα παραλείπεται· ονόμασέ τον μία φορά για να προστεθεί.'
          : `${skipped} αριθμοί που δεν έχουν τοποθετηθεί ακόμη στην εικόνα παραλείπονται· ονόμασέ τους μία φορά για να προστεθούν.`}</p>` : ''}`;
    }
    if (s.spot) {
      const word = SPOT[s.spot];
      const right = accepted(label, s.spot);
      const gap = guess ? nearest(right, guess) : Infinity;
      const saved = !right.length || gap < 0.001, close = gap < 0.05;
      const message = saved
        ? `Αποθηκεύτηκε ως ${word.name}. Έλεγξέ το με το κείμενο· ${tapLow} ξανά για να το μετακινήσεις.`
        : close
          ? `Κοντά σε αποθηκευμένο σημείο (πράσινο). ${tap} ξανά για να μετακινήσεις το αποθηκευμένο σημείο.`
          : `${right.length > 1 ? 'Τα αποθηκευμένα σημεία είναι πράσινα' : 'Το αποθηκευμένο σημείο είναι πράσινο'}, το δικό σου μπλε. Αν είναι σωστό και το δικό σου, διάλεξε «Επίσης σωστό»· ${tapLow} ξανά για να μεταφέρεις εκεί το αποθηκευμένο.`;
      return `
        <p class="kicker">Πού βρίσκεται η ${word.name}</p>
        <div class="q-line"><span class="q-number small">${esc(label.number)}</span><span class="q-name">${esc(label.name)}</span></div>
        ${guess == null
          ? tapHint(`${tap} στο σημείο πάνω στην εικόνα`)
          : `<p class="note">${message}</p>
             ${label.context ? `<div class="q-passage">${highlight(label.context, label.number, label.name, [word.name, word.stem])}</div>` : ''}`}
        ${answerButtons('Σωστό', 'Λάθος', guess == null)}
        ${guess && !saved && !close ? `<button class="btn soft-ok wide" data-act="also">${icon.check}<span>Επίσης σωστό: κράτα και τα δύο</span></button>` : ''}
        <button class="link quiet" data-act="stop">Μη ρωτάς απόφυση/κατάφυση για «${esc(label.name)}»</button>`;
    }
    const placing = needsPlacing();
    return `
      <p class="kicker">Τι είναι το νούμερο</p>
      <div class="q-number">${esc(label.number)}</div>
      ${placing
        ? tapHint(`Πρώτα ${tapLow} εκεί που είναι τυπωμένο το <b>${esc(label.number)}</b> στην εικόνα και μετά απάντησε`)
        : placed ? `<p class="note">${tap} ξανά για να το μετακινήσεις.</p>` : ''}
      ${answerButtons('Το ξέρω', 'Δεν το ξέρω', placing)}
      ${!placing && !placed ? `<p class="fine">${coarse ? 'Κράτα πατημένο στην εικόνα' : '⌥-κλικ στην εικόνα'} για να μετακινήσεις το ${esc(label.number)}.</p>` : ''}`;
  }

  function prevHTML() {
    const key = lastKey();
    const label = key && labelOf(parseStep(key).number);
    if (!label) return '';
    const s = parseStep(key);
    return `
      <p class="kicker">Προηγούμενο</p>
      <div class="prev-line ${answers[key] ? 'ok' : 'bad'}">
        <b>${esc(label.number)}</b>
        <span class="prev-name" data-number="${esc(label.number)}">${esc(label.name)}${s.spot ? ` — ${SPOT[s.spot].name}` : ''}</span>
        <button class="info" data-act="info" data-number="${esc(label.number)}" aria-label="Απόσπασμα από το βιβλίο" title="Απόσπασμα">${icon.info}</button>
      </div>
      <div class="prev-actions">
        <button class="link" data-act="undo">${icon.undo}<span>Αναίρεση</span>${kbd(UNDO_KEY)}</button>
        ${canMarkPreviousWrong() ? `<button class="link bad" data-act="prevwrong"><span>Τελικά δεν το ήξερα</span>${kbd('X')}</button>` : ''}
      </div>`;
  }

  function update() {
    const s = step();
    const done = Math.min(pos, queue.length);
    const right = Object.values(answers).filter(Boolean).length;
    const wrong = Object.keys(answers).length - right;

    root.classList.toggle('coarse', coarse);
    $('.seg').dataset.value = mode;
    for (const b of root.querySelectorAll('.seg button')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    $('[data-in=scramble]').checked = scramble;
    $('[data-in=showall]').checked = showAll;
    $('.bar i').style.transform = `scaleX(${queue.length ? done / queue.length : 0})`;
    $('.count').textContent = `${done} / ${queue.length}`;
    $('.grip-count').textContent = `${done} / ${queue.length}`;
    $('.tally .ok b').textContent = right;
    $('.tally .bad b').textContent = wrong;
    $('.grip-undo').disabled = pos <= 0;

    card.innerHTML = cardHTML();
    const shown = finished() ? 'done' : s?.key ?? 'none';
    if (shown !== shownStep) {
      shownStep = shown;
      card.classList.remove('swap');
      void card.offsetWidth;
      card.classList.add('swap');
    }
    prev.innerHTML = prevHTML();
    prev.hidden = !prev.innerHTML;

    drawMarks();
    layoutTags();
    drawCursor();
    sizeSheet();
  }

  function nudge() {
    const hint = card.querySelector('.hint');
    if (!hint) return;
    hint.classList.remove('nudge');
    void hint.offsetWidth;
    hint.classList.add('nudge');
  }

  // ---- Bottom sheet (portrait)

  const portrait = matchMedia('(orientation: portrait) and (max-width: 900px)');
  let sheet = false, collapsedH = 0, expandedH = 0;

  function sizeSheet() {
    sheet = portrait.matches;
    root.classList.toggle('sheet', sheet);
    if (!sheet) { panel.style.height = ''; return; }
    const vh = root.clientHeight;
    if (sheetOpen == null) sheetOpen = vh >= 900;
    const pad = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
    // Collapsed shows just the question and its answer buttons.
    collapsedH = Math.min($('.grip-row').offsetHeight + card.offsetHeight + pad, vh * 0.62);
    expandedH = Math.min(Math.max(vh * 0.38, collapsedH + 150), vh * 0.8);
    root.classList.toggle('sheet-open', sheetOpen);
    panel.style.height = `${sheetOpen ? expandedH : collapsedH}px`;
    if (!sheetOpen) scroller.scrollTop = 0;
  }

  function setSheet(open) {
    sheetOpen = open;
    store.saveSettings({ sheetOpen });
    sizeSheet();
  }

  {
    const grip = $('.grip');
    let drag = null;
    grip.addEventListener('pointerdown', (e) => {
      grip.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, h: panel.offsetHeight, moved: false };
      panel.classList.add('dragging');
    });
    grip.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) panel.style.height = `${clamp(drag.h - dy, collapsedH, expandedH)}px`;
    });
    const end = () => {
      if (!drag) return;
      const { moved } = drag;
      drag = null;
      panel.classList.remove('dragging');
      setSheet(moved ? panel.offsetHeight > (collapsedH + expandedH) / 2 : !sheetOpen);
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(!sheetOpen); } });
  }

  // ---- Events

  const actions = {
    back: onBack,
    zin: () => viewer.zoomBy(1.4),
    zout: () => viewer.zoomBy(1 / 1.4),
    zfit: () => viewer.wholePage(),
    know: () => answer(true),
    dont: () => answer(false),
    also: alsoCorrect,
    stop: stopAskingSpots,
    undo,
    prevwrong: markPreviousWrong,
    repeat: () => startRound(true),
    restart: () => startRound(false),
    next: () => { const next = plates[plates.indexOf(plate) + 1]; if (next) setPlate(next); },
    info: (el) => (passage?.number === el.dataset.number ? closePassage() : openPassage(el.dataset.number, 'touch')),
  };

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled) { actions[el.dataset.act]?.(el); return; }
    const seg = e.target.closest('[data-mode]');
    if (seg && seg.dataset.mode !== mode) {
      mode = seg.dataset.mode;
      store.saveSettings({ mode });
      startRound(false);
    }
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.in === 'scramble') {
      scramble = t.checked;
      store.saveSettings({ scramble });
      startRound(false);
    } else if (t.dataset.in === 'showall') {
      showAll = t.checked;
      update();
    } else if (t === select) {
      const next = plates.find((p) => p.id === select.value);
      select.blur();
      if (next && next !== plate) setPlate(next);
    }
  });

  root.addEventListener('pointerover', (e) => hoverName(e, true));
  root.addEventListener('pointerout', (e) => hoverName(e, false));

  const onKey = (e) => {
    if (e.repeat || e.target.matches?.('input:not([type=checkbox]), textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (e.metaKey || e.ctrlKey) {
      if (k === 'z' || k === 'ζ') { e.preventDefault(); undo(); }
      return;
    }
    if (e.altKey) return;
    if (k === 'z' || k === 'ζ') { e.preventDefault(); if (!step()?.find) answer(true); }
    else if (k === 'x' || k === 'χ') { e.preventDefault(); answer(false); }
    else if (k === 'escape') closePassage();
  };

  const onPointerDown = (e) => {
    // The wording follows the input in use ("κλικ" or "άγγιξε").
    const now = e.pointerType !== 'mouse';
    if (now !== coarse) { coarse = now; update(); }
    // A passage opened by touch closes on the next tap anywhere.
    if (passage?.by === 'touch' && !e.target.closest?.('.info, .viewer')) closePassage();
  };

  const onLayout = () => { sizeSheet(); };
  const stopPageZoom = (e) => e.preventDefault();
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('gesturestart', stopPageZoom);
  portrait.addEventListener('change', onLayout);
  window.addEventListener('resize', onLayout);
  document.fonts?.ready.then(() => { measurer = null; layoutTags(); });

  // ---- Start

  $('.p-title').textContent = lectureTitle ? `${atlas.title} · ${lectureTitle}` : atlas.title;
  select.innerHTML = plates.map((p) => `<option value="${esc(p.id)}">${esc(figureName(p))}</option>`).join('');
  $('.select-wrap').hidden = plates.length < 2;
  const remembered = store.figure(atlas.id, lectureID);
  setPlate(plates.find((p) => p.id === remembered) || plates[0]);

  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('gesturestart', stopPageZoom);
      portrait.removeEventListener('change', onLayout);
      window.removeEventListener('resize', onLayout);
      clearTimeout(hoverTimer);
      viewer.destroy();
    },
  };
}
