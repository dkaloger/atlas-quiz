# Άτλας: the atlas quiz website

A static website (no build step, no server code) that runs MedStudy's atlas quiz for classmates, on
desktop browsers and on iPad or iPhone. The interface is in Greek.

The data is a MedStudy atlas export (`manifest.json` plus an `atlases/` folder).

## Updating the atlases

1. In MedStudy, export the atlases (Library → share button, or right-click a subject).
2. Replace the contents of `data/` with the contents of the exported folder, so that
   `data/manifest.json` and `data/atlases/` exist.
3. Upload the site again.

Classmates keep their progress: it is stored in their browser by atlas id and figure id.

## Publishing

Upload this whole folder to any static host: GitHub Pages, Netlify or Cloudflare Pages.
It works from a sub-path, because every link is relative.

Anyone with the link can open the figure images.

## Trying it on this Mac

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>. Opening `index.html` straight from the Finder does not work,
because browsers block `fetch` on `file://` pages.

## Files

| File | What it does |
|---|---|
| `index.html`, `css/app.css` | The page and its look |
| `js/main.js` | Start-up and navigation between the list and the quiz |
| `js/home.js` | The list of subjects, lectures and atlases, and the progress backup |
| `js/quiz.js` | The quiz: rounds, questions, answers, undo, the panel and the bottom sheet |
| `js/viewer.js` | The figure: zoom, pan, taps and long-presses |
| `js/data.js` | Loads the export and merges the classmate's changes over it |
| `js/store.js` | What is saved in the browser (`localStorage`, keys start with `mq:`) |
| `js/text.js` | Bold highlights in the book's passage |
| `manifest.webmanifest`, `icons/` | "Add to Home Screen" on iPad and iPhone |

The fonts (Literata and Commissioner) load from Google Fonts. Without a connection the page uses the
system's fonts.
