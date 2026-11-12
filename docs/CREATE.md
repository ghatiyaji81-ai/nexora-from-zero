# CREATE

CREATE is the authenticated creative workspace at `/create`. Projects, assets, version snapshots, and export records are stored in MongoDB. API ownership comes only from the NEXORA session; project, asset, version, export, and GridFS queries are owner-scoped. Uploaded files use the private `create_assets` GridFS bucket and are limited to 25 MB. The supported, signature-checked upload types are PNG, JPEG, WebP, GIF, MP4, WebM, MP3, WAV, PDF, and UTF-8 TXT.

Run `npm run db:create-indexes` after deployment to create the CREATE model indexes. MongoDB replica-set requirements are unchanged from the rest of NEXORA.

## Working studios

- **Design:** responsive SVG canvas with text, image and shape layers, drag positioning, resizing, rotation, color/background controls, grid, zoom, layer selection, undo/redo, and SVG/PNG downloads.
- **Image:** local canvas rendering with crop bounds, rotation, flip, brightness, contrast, saturation, blur and a text overlay. PNG, JPEG and WebP export are browser-native.
- **Document and content:** autosaved plain text/Markdown, import of TXT/Markdown/HTML and THINK-extracted PDF/DOCX text, formatting helpers, text/Markdown/HTML downloads, and browser print-to-PDF. Writing assistance creates a normal THINK writing-agent conversation and uses the existing streaming endpoint; provider errors are shown, never replaced with generated placeholders.
- **Presentation:** editable, reorderable, duplicable slides, notes, backgrounds, keyboard-navigable presentation mode, and print-to-PDF.
- **Video:** private MP4/WebM upload, native browser playback, seeking, trim range, split markers, volume and editable caption text. A WebM trim can be captured with `captureStream` and `MediaRecorder` where the browser supports the codec. The export contains the video capture only; caption overlays, audio mixing, and transcoding are not implemented.
- **Audio:** private MP3/WAV upload, native playback, volume, and original-file download.

Project data autosaves after a short debounce. Content changes produce owner-scoped version snapshots (up to 30 retained per project); the history panel can restore a version. Project deletion removes its versions and detaches its assets without deleting those files. Asset deletion is explicit and removes its private GridFS object.

## Provider status and limitations

THINK is the only connected AI system. CREATE uses its existing server-side provider configuration and rate limits. If no provider is configured, the writing action is disabled and editing/export remain available. No image, video, audio-generation, or AI-editing provider is configured; those capabilities are not presented as working.

The server-only `CreateMediaProvider` contract and authenticated `/api/create/providers` status route define the future media-adapter boundary. The registry currently reports media capabilities as unavailable; no generation adapter or provider credentials are installed.

PDF output uses the browser print dialog. PPTX/DOCX export, rich DOCX formatting preservation, presentation image/shape elements, multi-clip video composition, rendered captions/audio mixing, FFmpeg rendering, AI media generation, and direct voice-command execution inside CREATE are not implemented. SPEAK remains the sole microphone and speech-recognition system; its existing route can be opened from Content Studio.

Automated unit tests cover category/editor mapping, project template data, filename normalization, and upload signature rejection. Authenticated MongoDB integration tests cover project/asset CRUD and cross-owner isolation when run against a configured replica set and live app.
