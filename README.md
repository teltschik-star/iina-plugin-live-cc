# Live CC Generator

An IINA plugin that generates closed captions from the playing file's own audio
track, transcribing ahead of the playhead and drawing the captions over the video.

Speech recognition runs locally through [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
Nothing is uploaded, no API key is needed, and it works offline.

## How it works

Because the audio comes from the file rather than a live microphone, the plugin
is not bound to realtime. It slices the file into fixed-length chunks, decodes
each one to 16 kHz mono PCM with `ffmpeg`, and runs whisper over it — always
picking the chunk at the playhead first, then the ones just ahead of it.

```
file ──ffmpeg -ss/-t──► 16kHz mono WAV ──whisper-cli -oj──► cues ──► overlay webview
         (one chunk)                          (JSON)         (sorted store)
```

A single worker processes one chunk at a time; whisper saturates the CPU, so
parallel chunks would only delay the one the viewer is about to reach. After
each chunk the worker re-derives what to do next from the *current* playback
position, which is what makes seeking cheap — there is no queue to rebuild.

Each chunk is decoded with a few seconds of extra tail audio so whisper hears the
end of a sentence instead of a hard cut. Cues that begin inside that tail are
discarded, since the next chunk will produce them properly, and a cue that starts
before the boundary but runs into the tail has its end clamped to the boundary —
otherwise exported SubRip ends up with overlapping cues.

## Requirements

```bash
brew install ffmpeg whisper-cpp
```

whisper.cpp **1.9.2 or newer** is required if you intend to use voice activity
detection; any version works otherwise.

Then download a model from **Plugins → Live CC Generator → Download Speech
Model**, or point the preferences at a `.bin` you already have.

Model guidance on Apple Silicon:

| Model | Size | Notes |
| --- | --- | --- |
| `ggml-base.en` | 141 MB | Default. Comfortably faster than realtime. |
| `ggml-small.en` | 465 MB | Noticeably better; still keeps ahead on an M-series chip. |
| `ggml-small` | 465 MB | Practical floor for non-English audio. |
| `ggml-medium` | 1.5 GB | Better non-English accuracy. |
| `ggml-large-v3-turbo` | 1.5 GB | Best quality, but **cannot translate**. Increase "chunks ahead" if it falls behind. |

### Languages other than English

Models ending in `.en` are English-only: whisper ignores the language and
translate settings entirely and will transcribe any input as if it were English.
Everything else is multilingual, covering roughly 99 languages.

So for Spanish audio, download a multilingual model and set **Language** to `es`
(or leave it at `auto` to detect per chunk). There is no Spanish-specific model —
one multilingual model handles every language. Accuracy on non-English audio
falls off faster with the smaller models than it does in English, so `small` is
the realistic starting point rather than `base`.

### Translating to English

**Translate to English** works only on a multilingual model — and not on every
one. `large-v3-turbo` is a distilled, transcription-only model: whisper accepts
`--translate` and silently ignores it, returning the source language. Verified on
the same Spanish clip with identical flags:

| Model | `-tr` output |
| --- | --- |
| `ggml-small` | "Well, Miguelito. Let's go because daddy wants to work." |
| `ggml-large-v3-turbo` | "Bueno, Miguelito, vámonos porque papi tiene que ir a trabajar." |

Use `small` or `medium` to translate. The plugin shows an OSD warning when
captions start with a model that cannot honour the setting.

Even where it works, translation is a single speech-to-English-text pass rather
than transcription followed by translation, and is markedly looser than
transcribing in the source language: "papi tiene que ir a trabajar" became "daddy
wants to work", and "¿Eres un doctor?" became "Do you want a doctor?". The gist
survives; the details often do not. If accuracy matters, transcribe in the source
language and translate the exported `.srt` separately.

## Installing for development

```bash
npm run link
```

This symlinks the project into IINA's plugin folder as
`Live CC Generator.iinaplugin-dev`. Restart IINA, then **enable it** under
*Settings → Plugins* — a newly discovered plugin is listed but unchecked, and
its menu items do not appear until it is ticked.

**Picking up code changes requires quitting and relaunching IINA.** *Plugin →
Reload All Plugins* is not sufficient for the main entry: that script runs per
player core, and reloading does not re-initialize it for a player that already
exists, so stale menu items and stale handlers survive the reload.

`npm run unlink` removes the symlink; `npm run pack` produces a distributable
`.iinaplgz`.

There is no build step — the plugin is plain CommonJS loaded by IINA's own
`require()`. `jsconfig.json` wires up `iina-plugin-definition` so editors still
give full autocomplete and type checking on the `iina` API.

## Using it

**Plugins → Live CC Generator:**

- **Start Live Captions** (⌘⇧C) — begin transcribing from the current position.
- **Active Model** — switch between downloaded models, with a checkmark on the
  current one. Same setting as the Model dropdown in preferences.
- **Transcribe Whole File in Background** — after the playhead is buffered, keep
  filling in the rest of the file so seeking backwards is instant.
- **Save Captions as .srt** — writes `<video>.livecc.srt` next to the media file.
- **Load Captions as Subtitle Track** — same, then hands it to IINA as a real
  subtitle track (useful once a file is fully transcribed).

Both export options work mid-transcription and will tell you the result is partial.

### The language badge

Once the first chunk comes back, a badge appears top-right showing the language
whisper detected, as `Spanish (es)`. When the output is being translated it reads
`Spanish (es) → English (en)`.

The arrow reflects what is actually happening, not what is merely configured: with
Translate ticked on a model that cannot translate, the badge stays `Spanish (es)`
rather than promising English that never arrives.

Only the *first* detection is shown. With `auto`, whisper re-detects on every
chunk, and a badge that flickered between languages mid-playback would be noise.
English-only (`.en`) models never run detection, so no badge appears for them.

The badge fades out after 5 seconds — it is an announcement, not a permanent
readout. It sits above the transcription-progress badge, so that one appearing and
disappearing does not shift it around.

## Preferences

Open *Settings → Plugins*, click the plugin's **name** (clicking the checkbox only
toggles it and never opens the detail pane), then the **Settings** tab. The window
opens small — resize it to see the whole page.

**Model** is a dropdown of everything in the plugin's `models` folder. The plugin
scans that folder at startup and after each download, so the list stays current;
a model picked via *Choose Model File…* lives elsewhere and shows as "(custom)".

Alongside it: `whisper-cli` path, language, and translation, plus:

- **Chunk length** — shorter reaches the screen sooner, longer gives the model
  more context and reads better.
- **Chunk overlap** — tail audio per chunk, so sentences are not cut mid-word.
- **Chunks ahead** — how far past the playhead to stay buffered.
- **CPU threads** — 0 lets whisper.cpp decide.
- Caption font size, max line length, and top/bottom placement.

## Layout

```
Info.json           plugin manifest, permissions, preference defaults
preferences.html    settings panel shown inside IINA
ui/overlay.html     the caption renderer (a webview over the video)
src/index.js        entry point: menus, events, overlay messaging
src/scheduler.js    chunk queue that tracks the playhead
src/media.js        audio track selection and ffmpeg extraction
src/whisper.js      whisper.cpp invocation and JSON parsing
src/cues.js         sorted cue store with binary-search lookup
src/srt.js          SubRip rendering
src/config.js       preference reading, coercion, clamping
src/deps.js         locating ffmpeg/whisper, downloading models
```

## When settings take effect

Preferences are read once, when captions start, and held for that session. Model,
language, translation and chunk pacing all behave this way — changing them while
captions are running does nothing until you **Stop Live Captions and start them
again**, which re-transcribes from scratch and discards the cues collected under
the old settings.

Two things compound this. IINA only flushes a plugin's preferences to disk when
the settings window is closed, so a change is not even visible to the plugin until
then. And already-transcribed audio is never revisited on its own — the scheduler
skips chunks it has already done, so a mid-session change could not retroactively
alter existing cues even if it were noticed.

## Quirks of IINA's preferences page

Two behaviours in IINA 1.4.4 shape how `preferences.html` is written. Both were
found the hard way; neither is documented.

**`preferences.get()`'s callback never fires.** In the preferences webview the
call returns `undefined` and the callback is never invoked, so the documented
custom-binding pattern cannot read anything. `preferences.set()` is fine — it
needs no callback. Reads therefore go through IINA's own `data-pref-key`
binding: two off-screen `<input>` elements are bound to the keys the page needs,
and the script reads their `value` (polling briefly, since binding lands after
first paint).

**Values containing double quotes never arrive.** `model_path` bound correctly
while a JSON `installed_models` payload arrived as an empty string. IINA appears
to interpolate preference values into JavaScript without escaping, so quotes
break the assignment silently. The plugin therefore percent-encodes that payload
(`encodeURIComponent`, plus `'` → `%27`) and the page decodes it, leaving only
characters that cannot terminate a string literal.

The **Active Model** menu exists partly for this reason: it drives the same
setting entirely from the plugin script, with no webview involved.

## Repetition and invented text

Whisper is autoregressive, so on silence, music or indistinct audio its decoder
can fall into a loop, emitting the same phrase over and over, or invent plausible
text outright. This is inherent to the model, not specific to this plugin, and
chunked transcription makes it more visible: every chunk boundary is another
chance to decode a stretch of non-speech.

Three mitigations are in place.

**`--suppress-nst` is always on.** Measured on a quiet passage of a film, it
turned the hallucination `incorrect you have been in an inch` into the dialogue
that was actually spoken (`Cognition assessment. What is 2 plus 2? Incorrect.`),
and left clean speech byte-identical. It is a clear win with no observed downside.

**Loop cleanup runs on every chunk** (`src/cleanup.js`). A phrase repeated four or
more times consecutively collapses to one occurrence, and a run of identical cues
is reduced. The threshold is deliberately high: "Mira, mira, mira este para qué
es." is real speech and must survive, so three repeats are always left alone.

**Voice activity detection is available but off by default.** It drops non-speech
audio before decoding. Measured against whisper.cpp 1.9.5 on a quiet film passage
and on pure silence:

| Threshold | Quiet dialogue | Pure silence |
| --- | --- | --- |
| 0.05 | 7 cues | empty |
| 0.10 | 2 cues | empty |
| 0.15–0.20 | **nothing** | empty |
| 0.25–0.40 | 3–5 cues | empty |
| 0.45–0.50 | **nothing** | empty |
| 0.60 | 2 cues | empty |
| 0.70 | **nothing** | empty |

Hallucination suppression is reliable at every threshold. Speech *retention* is
not, and it is not a smooth function of the threshold — there is no setting that
can be recommended as safe, which is why this stays opt-in. The default is 0.3,
the best performer above; whisper.cpp's own default of 0.5 produced nothing at all
on that passage.

One point in its favour: VAD **improves timestamp accuracy** when a chunk begins
with silence. On a probe of 10 s silence followed by speech, the non-VAD run
placed the first cue at 00:00.000 while VAD correctly placed it at ~00:10.4.

Requires whisper.cpp **1.9.2 or newer** — earlier versions map VAD timestamps
against the compressed timeline rather than the original audio, which would
misalign every cue. Download the model from *Plugins → Live CC Generator →
Download Voice Activity Model*.

None of this eliminates the problem. A larger model hallucinates less; so does
avoiding long non-speech stretches.

## Known limitations

- Only the *selected* audio track is transcribed. Switching tracks mid-playback
  does not retranscribe what was already done.
- IINA runs as a GUI app, so its `PATH` usually excludes Homebrew. The plugin
  checks `/opt/homebrew/bin` and `/usr/local/bin` directly; anything else needs
  a full path in preferences.
- Captions appear in an overlay, not as a subtitle track, so IINA's subtitle
  styling controls do not apply to them. Export to `.srt` if you want those.
- A few words can repeat across a chunk boundary. Whisper transcribes the tail
  audio into a cue that starts before the boundary, and the next chunk then
  transcribes the same audio properly. Timings do not overlap, but the wording
  can. Longer chunks make it happen less often; eliminating it would need
  text-level alignment between adjacent chunks.
