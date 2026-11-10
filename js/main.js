// Boot and routing: "#/" is the list, "#/q/<atlas>/<lecture|all>" the quiz.

import { store } from './store.js';
import { loadLibrary } from './data.js';
import { mountHome } from './home.js';
import { mountQuiz } from './quiz.js';

const app = document.getElementById('app');
let library = null;
let screen = null;
let pushedQuiz = false; // the list is one step back in the history

const quizHash = (atlasID, lectureID) => `#/q/${atlasID}/${lectureID || 'all'}`;
const desktop = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

function parseRoute() {
  const m = /^#\/q\/([^/]+)\/([^/]+)/.exec(location.hash);
  if (!m) return null;
  const atlas = library.atlases.get(decodeURIComponent(m[1]));
  if (!atlas) return null;
  return { atlas, lectureID: m[2] === 'all' ? null : decodeURIComponent(m[2]) };
}

function findLecture(atlasID, lectureID) {
  for (const subject of library.manifest.subjects || []) {
    for (const lecture of subject.lectures || []) {
      const entry = lecture.id === lectureID && lecture.atlases?.find((a) => a.atlasID === atlasID);
      if (entry) return { lecture, figures: entry.figures };
    }
  }
  return null;
}

function show() {
  screen?.destroy();
  const route = parseRoute();
  document.documentElement.classList.toggle('in-quiz', !!route);
  if (route) {
    const found = route.lectureID && findLecture(route.atlas.id, route.lectureID);
    screen = mountQuiz(app, {
      atlas: route.atlas,
      lectureID: found ? route.lectureID : null,
      lectureTitle: found ? found.lecture.title : null,
      figures: found ? found.figures : null,
      onBack: closeQuiz,
    });
  } else {
    const last = store.last();
    if (last?.open) store.saveLast({ ...last, open: false });
    screen = mountHome(app, {
      manifest: library.manifest,
      atlases: library.atlases,
      onOpen: openQuiz,
      onImported: async () => { library = await loadLibrary(); show(); },
    });
    window.scrollTo(0, 0);
  }
}

function openQuiz(atlasID, lectureID) {
  // On desktop the quiz fills the screen, as the app does. (iPad Safari: use Add to Home Screen.)
  if (desktop()) document.documentElement.requestFullscreen?.().catch(() => {});
  history.pushState({ quiz: true }, '', quizHash(atlasID, lectureID));
  pushedQuiz = true;
  show();
}

function closeQuiz() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (pushedQuiz) history.back();
  else { history.replaceState(null, '', '#/'); show(); }
}

window.addEventListener('popstate', () => {
  pushedQuiz = !!history.state?.quiz;
  if (!parseRoute() && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  show();
});

function fail(error) {
  console.error(error);
  app.innerHTML = `
    <main class="home"><header class="masthead">
      <p class="eyebrow">MedStudy · Κουίζ ανατομίας</p>
      <h1>Άτλας<span class="dot"></span></h1>
      <p class="lede">Δεν βρέθηκαν άτλαντες. Βάλε τα περιεχόμενα του φακέλου εξαγωγής του MedStudy (το <code>manifest.json</code> και τον φάκελο <code>atlases</code>) μέσα στον φάκελο <code>data</code> της σελίδας και φόρτωσέ τη ξανά.</p>
    </header></main>`;
}

async function boot() {
  try {
    library = await loadLibrary();
  } catch (error) {
    fail(error);
    return;
  }
  // Reopening the site continues where you left off; Back still leads to the list.
  const last = store.last();
  let target = parseRoute() ? location.hash : null;
  if (!target && !location.hash.startsWith('#/q/') && last?.open && library.atlases.has(last.atlasID)) {
    target = quizHash(last.atlasID, last.lectureID);
  }
  history.replaceState(null, '', '#/');
  if (target) {
    history.pushState({ quiz: true }, '', target);
    pushedQuiz = true;
  }
  show();
}

boot();
