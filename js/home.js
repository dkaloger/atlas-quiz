// The start page: subjects, then lectures, then atlases, in the order of manifest.json.

import { store } from './store.js';
import { esc, html, icon } from './util.js';
import { shownPlates, figureName, imageURL, progress } from './data.js';

const dateFormat = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : dateFormat.format(d); };

function row(atlas, figures, lectureID) {
  const plates = shownPlates(atlas, figures);
  const { known, total } = progress(plates);
  const labels = plates.reduce((n, p) => n + p.labels.length, 0);
  const subset = plates.length < atlas.plates.length;
  const thumbs = plates.slice(0, 3).reverse()
    .map((p) => `<img src="${esc(imageURL(atlas, p))}" alt="" loading="lazy" decoding="async">`).join('');
  const share = total ? known / total : 0;
  return `
    <button class="atlas-row" data-atlas="${esc(atlas.id)}" data-lecture="${esc(lectureID || '')}">
      <span class="thumbs n${Math.min(plates.length, 3)}">${thumbs}</span>
      <span class="atlas-text">
        <span class="atlas-title">${esc(atlas.title)}</span>
        <span class="atlas-meta">${subset
          ? `${plates.length} από ${atlas.plates.length} εικόνες`
          : plates.length === 1 ? '1 εικόνα' : `${plates.length} εικόνες`} · ${labels} αριθμοί</span>
      </span>
      <span class="atlas-score${total && known === total ? ' full' : ''}">
        <span class="score"><b>${known}</b>/${total}</span>
        <span class="meter"><i style="transform:scaleX(${share})"></i></span>
      </span>
      <span class="go">${icon.chevron}</span>
    </button>`;
}

export function mountHome(host, { manifest, atlases, onOpen, onImported }) {
  const sections = [];

  for (const subject of manifest.subjects || []) {
    const lectures = (subject.lectures || []).map((lecture) => {
      const rows = (lecture.atlases || [])
        .filter((a) => atlases.has(a.atlasID))
        .map((a) => row(atlases.get(a.atlasID), a.figures, lecture.id)).join('');
      if (!rows) return '';
      const meta = [lecture.lectureNumber != null ? `Διάλεξη ${lecture.lectureNumber}` : '', lecture.lectureDate ? formatDate(lecture.lectureDate) : '']
        .filter(Boolean).join(' · ');
      return `
        <div class="lecture">
          <div class="lecture-head"><h3>${esc(lecture.title)}</h3>${meta ? `<span>${esc(meta)}</span>` : ''}</div>
          ${rows}
        </div>`;
    }).join('');
    if (!lectures) continue;
    sections.push(`
      <section class="subject" style="--subject:${esc(subject.colorHex || '#888')}">
        <h2><i></i>${esc(subject.title)}</h2>
        ${lectures}
      </section>`);
  }

  const unfiled = (manifest.unfiledAtlases || []).filter((id) => atlases.has(id));
  if (unfiled.length) {
    sections.push(`
      <section class="subject plain">
        <h2>Άλλοι άτλαντες</h2>
        <div class="lecture">${unfiled.map((id) => row(atlases.get(id), null, null)).join('')}</div>
      </section>`);
  }

  // Every figure of every atlas, whatever the lectures picked.
  const filed = [...atlases.values()].filter((a) => !unfiled.includes(a.id));
  if (filed.length) {
    sections.push(`
      <section class="subject plain">
        <h2>Ολόκληροι οι άτλαντες</h2>
        <div class="lecture">${filed.map((a) => row(a, null, null)).join('')}</div>
      </section>`);
  }

  const last = store.last();
  const lastAtlas = last && atlases.get(last.atlasID);
  let resume = '';
  if (lastAtlas) {
    const lecture = (manifest.subjects || []).flatMap((s) => s.lectures || []).find((l) => l.id === last.lectureID);
    const figures = lecture?.atlases?.find((a) => a.atlasID === lastAtlas.id)?.figures;
    const plates = shownPlates(lastAtlas, figures);
    const plate = plates.find((p) => p.id === store.figure(lastAtlas.id, last.lectureID)) || plates[0];
    resume = `
      <button class="resume" data-atlas="${esc(lastAtlas.id)}" data-lecture="${esc(lecture ? lecture.id : '')}">
        <span class="resume-ring"><i></i></span>
        <span class="resume-text"><small>Συνέχισε από εκεί που σταμάτησες</small>
          <b>${esc(lastAtlas.title)} · ${esc(figureName(plate))}</b>${lecture ? `<span>${esc(lecture.title)}</span>` : ''}</span>
        <span class="go">${icon.next}</span>
      </button>`;
  }

  const root = html`
    <main class="home">
      <header class="masthead">
        <p class="eyebrow">MedStudy · Κουίζ ανατομίας</p>
        <h1>Άτλας<span class="dot"></span></h1>
        <p class="lede">Κάθε εικόνα έχει αριθμούς. Πες από μνήμης τι δείχνει ο καθένας, ή βρες πάνω στην εικόνα το όνομα που σου ζητείται.</p>
      </header>
      ${resume}
      ${sections.join('') || '<p class="empty">Δεν υπάρχουν άτλαντες σε αυτή την εξαγωγή.</p>'}
      <footer class="backup">
        <h2>Η πρόοδός σου</h2>
        <p>Αποθηκεύεται μόνο σε αυτόν τον browser. Σε iPad και iPhone το Safari μπορεί να τη σβήσει αν δεν ανοίξεις τη σελίδα για 7 ημέρες· πρόσθεσέ τη στην Οθόνη Αφετηρίας (Κοινή χρήση → Προσθήκη στην οθόνη Αφετηρίας) ή κράτα ένα αντίγραφο.</p>
        <div class="backup-actions">
          <button class="btn plain" data-backup="export">${icon.download}<span>Εξαγωγή προόδου</span></button>
          <button class="btn plain" data-backup="import">${icon.upload}<span>Εισαγωγή προόδου</span></button>
          <input type="file" accept="application/json,.json" hidden>
        </div>
        <p class="backup-status" role="status"></p>
        ${manifest.exportedAt ? `<p class="stamp">Άτλαντες ενημερωμένοι στις ${esc(formatDate(manifest.exportedAt))}</p>` : ''}
      </footer>
    </main>`;
  host.replaceChildren(root);

  const status = root.querySelector('.backup-status');
  const picker = root.querySelector('input[type=file]');

  root.addEventListener('click', (e) => {
    const open = e.target.closest('[data-atlas]');
    if (open) { onOpen(open.dataset.atlas, open.dataset.lecture || null); return; }
    const backup = e.target.closest('[data-backup]');
    if (backup?.dataset.backup === 'export') {
      const blob = new Blob([JSON.stringify(store.exportAll(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `atlas-proodos-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      status.textContent = 'Το αντίγραφο κατέβηκε.';
    } else if (backup?.dataset.backup === 'import') {
      picker.click();
    }
  });

  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    picker.value = '';
    if (!file) return;
    try {
      store.importAll(JSON.parse(await file.text()));
      onImported();
    } catch {
      status.textContent = 'Αυτό το αρχείο δεν είναι αντίγραφο προόδου.';
    }
  });

  return { destroy() {} };
}
