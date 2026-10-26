# Canopy Offline

An early standalone phylogenetic tree viewer for local Newick files. Open `index.html` in a modern browser; no server, installation, account, or internet connection is required. Maintained by **MRSIDDHANT**. This original project was developed with assistance from OpenAI ChatGPT/Codex.

## Try it

Download this repository as a ZIP, extract it, and open `index.html` in Firefox, Chrome, or Edge. Choose **Open tree** and select a `.treefile`, `.nwk`, or other plain-text Newick tree. The initial tree is synthetic demonstration data.

On Linux, from the project folder:

```sh
firefox "$PWD/index.html"
```

Use your local desktop browser for interactive exploration. A remote X11 session or Slurm GPU allocation does not ensure GPU rendering.

## Features

- Rectangular, circular, and rooted equal-angle radial layouts.
- WebGL branch drawing with Canvas 2D fallback; adaptive labels.
- Search original IDs, mapped names, and annotation groups.
- Edit displayed node names, show/hide individual labels, and place them at the node base or longest visible descendant path.
- Colour one branch, a selected clade, or all branches independently of text colours.
- Arial, Helvetica, Calibri, and Times New Roman; adjustable text size, bold, italic, and colour.
- Global typography by text category and overrides for individual labels and textboxes.
- Movable multiline textboxes, keyboard nudging, separate positions per layout, and undo/session persistence.
- Opt-in circular support gauges with a corner legend and selectable support field/scale.
- Hover to inspect, select, copy, or download all descendant protein labels, including hidden tips.
- Adjustable clade background highlights (60% opacity by default), included in sessions and image exports.
- Collapse, rotate, color, focus, ladderize, and reroot clades; undo tree edits.
- TSV accession-to-name mapping, group colors, numeric bars, and heatmaps.
- Unrooted Robinson–Foulds comparison for trees with identical unique tip IDs.
- PNG/JPEG exports at 300, 600, 1200 or custom DPI, with print-size controls and resolution metadata.
- SVG viewport/full view, Newick, and JSON session exports.
- Embedded logo and browser-tab icon, available offline.

The in-app **Guide** explains scientific conventions, controls, supported formats, and limitations.

## Edit node names and visibility

Select a node and use **Rename**, **Show name**, or **Hide name** in the inspector or pinned hover panel. Renaming creates a display alias and shows that label immediately. Original IDs and support values are kept for mapping and topology comparison. **Reset name** restores the mapped/original label; **Use global visibility** restores the global switch for that node. Hidden names are still present in the copy list. Changes support undo and sessions. The renamed Newick export applies display aliases to tips; internal labels remain the original labels/support values.

## Branch colours, label placement, and fonts

Select a node and use **Branch colour** on the left. **Selected branch** changes its incoming edge, **Selected clade** changes its incoming edge and descendants, and **All branches** applies a new base colour and clears branch overrides. Resetting one branch/clade restores the base colour or imported annotation colour; resetting all clears the base and overrides. These controls do not change text colours.

Under the selected node's **Name style & position**, choose **At node base** or **At longest branch tip**, set its typography, and click **Apply name style**. The latter uses the visible descendant endpoint with the longest cumulative path from the node, not just the longest individual edge. Branch-length mode uses lengths, with missing lengths counted as 1; without lengths it counts edges. Ties follow displayed child order. Collapsed clades use their visible endpoint. When the endpoint already has a tip label, the node name is placed just beyond it to avoid covering that label. Tip labels still follow the rectangular alignment switch. These choices work in all three layouts and image exports; raw labels/support values remain unchanged.

**Tree text style** sets defaults for tip labels, node names/support text, legend text, scale-bar text, and new textboxes. Individual node names and textboxes can override those defaults; **All tree text** replaces the individual overrides too. Available fonts are **Arial, Helvetica, Calibri, and Times New Roman**, with sizes 6–96, bold, italic, and text colour. Sizes are logical drawing pixels and scale with the exported image. Clade backgrounds and full-export bounds account for styled text dimensions. Full rectangular exports and Readable tips increase row spacing to suit larger fonts.

Fonts are used from the local computer; none are downloaded or bundled. If a font is unavailable, the browser uses a local sans-serif or serif fallback. PNG/JPEG preserve the rendered appearance. SVG keeps text editable and can use a different fallback on another computer.

## Textboxes

Choose **Add textbox** or **Text ＋** in the toolbar. Edit its content and typography on the left and click **Apply changes**. Newlines create multiple lines. Click the textbox to select it and drag to move it without panning the tree. With the tree canvas focused, use arrow keys to nudge one pixel, Shift + arrow for ten pixels, Enter to focus the editor, or Delete/Backspace to remove the selected box. The left-side dropdown also selects boxes outside the viewport.

Textbox anchor points move with panning and zooming; text size behaves like node labels. Each layout remembers its own positions. The first time a box is shown in another layout, it starts near that tree's centre and can be dragged into position. Session files retain all layout positions, content, and styles. Undo includes creation, text/style edits, moves, and removal. Up to 200 boxes, each with 4,000 characters / 100 lines, are supported.

View exports use the canvas region. Full-tree image/SVG exports extend their bounds to include every textbox, even those outside the viewport. Selection outlines are omitted. Textboxes, typography, and branch colours are presentation metadata and are not included in Newick.

## Optional support circles

Enable **support circles** to show the existing internal-node support values as softly filled circular gauges. Select the first, second, or third slash-separated value, and explicitly choose a 0–100 or 0–1 input scale. Invalid/out-of-range values are skipped and counted. The corner legend shows the filled percentage. No bootstrap replicates are computed.

This feature is off by default. No support extraction or circle calculations run while disabled, including normal loading, drawing and image export. Opening a new tree or saved session turns it off again. Enable it only when needed. The fitted view and full-tree export reserve space for the legend; manual panning can move labels beneath it.

## Publication-resolution image export

Choose PNG or JPEG, current view or full visible tree, print width in inches, and 300, 600, 1200 or custom DPI (72–2400). Pixel width is print width × DPI. The image is redrawn from tree geometry and text at the selected resolution; the screen bitmap is not enlarged. Both formats include physical-resolution metadata. SVG stays vector and uses the chosen print width in its size attributes.

For example, an 8-inch-wide 600 DPI image is 4,800 pixels wide. The height follows the selected view's aspect ratio. Raster exports are limited to 16,384 pixels per side and 64 megapixels to avoid excessive browser allocations. Very tall trees should be collapsed, exported by viewport, or exported as Full SVG. Browser canvas and font behavior can vary.

## Copy labels and highlight clades

Pause over a branch, node, or tip label to open its clade panel. Click a node to pin the panel, or use **Pin**. The text is selectable and includes every descendant tip, even if the clade is collapsed or the labels are not visible at the current zoom. Choose displayed labels, protein names, original IDs, or an ID/name TSV table. Unmapped names fall back to IDs. Duplicate names are retained, and row-breaking characters are normalized to spaces.

Use **Copy all**, **Select all text**, or **Download labels**. If your browser denies clipboard access for local files, the app selects the text and asks you to press Ctrl+C (Cmd+C on Mac). Focusing the text box pins the panel so its content does not change during selection.

Choose a color and **Highlight clade** to shade the clade background. The default is **60% opacity** (40% transparent); set opacity to 40% if you prefer 60% transparency. Rectangular views use rounded bands; circular views use fans; radial views use envelopes around descendant branches and labels. Multiple highlights can overlap. Use **Remove**, **Clear all highlights**, or **Undo** to clear shading. Backgrounds are drawn behind branches and text and appear in PNG/SVG exports and saved sessions. Newick exports remain free of display styling.

Highlights track a node's current descendants, so rerooting can change the highlighted membership. Focusing a descendant retains its ancestor's shading. Hidden child highlights reappear after expansion. Old version-1 session files remain supported.

## Mapping identifiers

Import a tab-separated file with a header. The dialog lets you select the ID and label columns, including UniProt `From` and `Protein names`. Exact ID matches take priority; otherwise a trailing coordinate suffix such as `/59-226` is removed for matching. Original IDs remain unchanged unless you explicitly export mapped Newick names.

Optional columns: `group`, `color` (#RRGGBB), `value` (nonnegative), and `heat:NAME` (numeric). Conflicting duplicate mappings are rejected. Annotation import replaces existing annotations. Save a session before closing; there is no autosave.

## Scientific and release limitations

This is version **0.4.0-alpha**, intended for evaluation and feedback. It is not a validated replacement for established scientific visualization software.

Core tests cover Newick parsing/round trips, malformed inputs, branch-distance preservation after rerooting, known RF distances, session serialization, layouts, a synthetic 9,223-tip tree, and a deep 10,000-tip tree. Separate development-time integration checks exercised UI handlers and Canvas 2D exports with a minimal simulated DOM. **Real-browser visual QA and physical GPU acceleration have not been verified.** Performance on actual user trees remains unmeasured.

Parsing accepts one Newick tree, finite nonnegative lengths, quoted labels, raw comments, and multifurcations. Missing lengths are drawn as 1 in branch-length mode. Numeric internal labels (including `95/100`) are treated as edge support when rerooting; raw comments remain node metadata. Unary input roots cannot be rerooted. RF comparison ignores lengths, supports, and rooting, and requires identical unique tip IDs.

Not implemented: Nexus/PhyloXML/Jplace, alignment tracks, all chart types, midpoint rooting, pruning, collaboration, or PDF export. WebGL accelerates branch drawing when the browser provides hardware acceleration; parsing, layout, labels, and annotations run on the CPU. Software WebGL is possible. Verify the renderer in the browser's graphics diagnostics.

## Privacy

The application makes no network requests and has no analytics or remote dependencies. Files are processed in the browser. The content security policy blocks network connections. Opening a hosted GitHub Pages version still sends the normal page request to GitHub; local file contents are not uploaded by the app.

## Develop

Source files are in `src/`; the generated standalone application is `index.html`.

```sh
python3 build.py
node tests/core.test.cjs
node tests/clades.test.cjs
node tests/presentation.test.cjs
```

Optional Canvas integration checks (development dependency only):

```sh
npm install
npm run test:canvas
```

These use a minimal simulated DOM and native Canvas 2D, not a real browser. They exercise hover/pin behavior, clipboard success and fallback, highlight persistence, 60% pixel alpha, and PNG/SVG layering, including a synthetic 9,223-tip example. Additional checks cover alias/visibility preservation, zero support-graphics calculations while disabled, actual PNG/JPEG pixel dimensions and physical DPI metadata, longest-path label placement in all layouts, branch-colour scopes, typography overrides, multiline textbox editing/dragging/nudging, safe session imports, old-session compatibility, and offscreen textbox inclusion in full exports. A 600 DPI native-Canvas export checks the styled text pixels as well as resolution metadata.

Python 3 is needed only to rebuild. Node.js 18 or newer is needed only for tests. End users need only a browser.

## Publish on GitHub Pages

Create a repository, upload these files at its root, then open **Settings → Pages**. Choose **Deploy from a branch**, select your default branch and **/(root)**, and save. GitHub will display the resulting site URL. Readers can also download `index.html` for offline use.

## Contributing and licensing

**A license has not yet been selected for this release.** No open-source license is currently granted. Please contact the repository owner before reusing or redistributing the source under separate terms.

Please report reproducible problems with a small synthetic tree, browser/OS versions, expected and actual behavior, and the renderer information. Do not post confidential sequence data in public issues.

## References


WebGL reference: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API

GitHub Pages setup: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
