# SAT Practice Studio

Local web app for practicing SAT questions from PDF pages, with persistent right/wrong tracking.

## What It Does

- Builds practice sessions by:
  - Subject (`English`, `Math`, or both)
  - Type tags (for example: `algebra`, `grammar`, `rhetorical`)
  - Status (`unattempted`, `wrong`, `right`, `ever wrong`)
  - Number of questions
- Shows each question from a PDF page in the app.
- Lets you answer and get immediate feedback when an answer key is saved.
- Supports self-grading when no answer key is saved.
- Tracks attempts, correct, wrong, and last result.
- Saves everything in browser local storage so progress stays between sessions.
- Includes bulk tools to create question entries by page range and assign tags.

## Setup

1. Copy your PDFs into the app folder:
   - Run: `powershell -ExecutionPolicy Bypass -File scripts/copy-source-pdfs.ps1`
2. Start a local static server from this folder (any option below):
   - `powershell -ExecutionPolicy Bypass -File scripts/start-server.ps1`
   - `python -m http.server 8080`
   - `py -m http.server 8080`
3. Open `http://localhost:8080`.

## Default Source Paths

- `assets/pdfs/English Hard.pdf`
- `assets/pdfs/Math Hard.pdf`

If your files are somewhere else, update them in the **PDF Sources** section of the app.

## First-Run Notes

- The app auto-seeds one question entry per PDF page (using the default page counts).
- These start with generic tags (`mixed`, `auto-imported`) and no answer keys.
- Use **Bulk Tools** and **Edit Question** to add real tags/answers/hints.
- Click **Parse PDFs For Domain/Skill + Ranges** in **Bulk Tools** to auto-detect:
  - question start/end pages
  - `Domain`
  - `Skill`

## Data Storage

All data is stored in browser `localStorage`:

- source settings
- question library
- progress history

Use **Export Data** regularly for backup.
