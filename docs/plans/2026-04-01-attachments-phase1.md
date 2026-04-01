# Hermes Chat Phase 1 Attachments

Date: 2026-04-01

## Goal

Add a narrow attachment flow to Hermes Chat without replacing the current Phase 1 bridge boundary.

## Constraints

- Keep the existing app -> Next API -> localhost bridge -> Hermes CLI flow.
- Reuse real user auth and per-chat Hermes session continuity.
- Keep uploaded files private to the authenticated user.
- Make the frontend attachment UX clean and small.
- Avoid pushing raw binary data through the bridge.

## Phase 1 attachment shape

1. Frontend
   - Add a hidden file input plus a visible `Attach files` button in the composer.
   - Show pending attachment pills before send.
   - Persist attachments in the transcript as chips/links on the user message.

2. Backend ingestion
   - Accept multipart form data on `POST /api/chat`.
   - Save uploaded files under local app storage.
   - Validate count, size, and file extensions.
   - Add an authenticated download route for persisted attachments.

3. Hermes-facing conversion
   - Keep the visible user message clean.
   - Generate a separate `hermes_content` field for each user message so Hermes gets:
     - attachment metadata
     - local file paths
     - extracted text for supported document types
   - Reuse `hermes_content` during bootstrap history so attachment context survives first-session replay.

## Supported files for this slice

Images:
- `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`

Structured documents with extraction:
- `.pdf`, `.docx`, `.xlsx`, `.pptx`

Text-like files with direct embedding:
- `.txt`, `.md`, `.csv`, `.json`, `.log`, `.py`, `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.html`, `.xml`, `.yaml`, `.yml`, `.toml`, `.ini`, `.sh`, `.sql`

## Explicitly out for now

- audio attachments
- video attachments
- archives like `.zip`
- legacy Office binaries like `.doc`, `.xls`, `.ppt`
- drag-and-drop upload polish
- image thumbnail galleries

## Validation plan

- run `npm run lint`
- run `npm run build`
- launch Next + bridge against a temporary SQLite DB
- register a real user via `/api/auth/register`
- upload txt/pdf/docx/pptx/xlsx together and verify Hermes returns embedded tokens
- upload an image and verify persistence plus Hermes sees the attachment metadata
- confirm attachment download route is auth-protected and returns stored bytes
- confirm unsupported files reject cleanly
