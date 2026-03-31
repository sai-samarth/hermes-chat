# Hermes Chat UI Refresh Implementation Plan

> For Hermes: implement this plan in priority order, validating with `npm run lint` and `npm run build` before finishing.

Goal: Bring Hermes Chat closer to the centered, spacious conversation layout described in the UI brief while keeping the current Phase 1 architecture intact.

Architecture: Keep the single-page App Router client in `app/page.tsx`, but split the work into three layers: UI state/helpers in the page component, markdown rendering in a dedicated utility, and visual system updates in `app/globals.css`. Add only the dependencies needed for real markdown rendering and code highlighting.

Tech stack: Next.js App Router, React 19, TypeScript, global CSS, `react-markdown`, `remark-gfm`, `rehype-highlight`.

---

## Repo understanding snapshot

- `app/page.tsx` holds the full signed-out and signed-in UI, including auth, sidebar, transcript, empty states, and composer.
- `lib/chat-markdown.tsx` currently contains a lightweight handwritten formatter; it should be replaced with a real markdown pipeline.
- `app/globals.css` owns essentially the full visual system.
- The app already supports persisted chats, SSE streaming, auth, and sidebar selection, so this pass is presentation-heavy rather than architectural.

## Task 1: Add markdown dependencies

Objective: install a real markdown renderer with GFM and code highlighting.

Files:
- Modify: `package.json`, `package-lock.json`

Steps:
1. Install `react-markdown`, `remark-gfm`, `rehype-highlight`, and `highlight.js`.
2. Verify the dependency tree updates cleanly.

## Task 2: Replace handwritten markdown rendering

Objective: support real markdown features in assistant responses.

Files:
- Modify: `lib/chat-markdown.tsx`
- Modify: `app/globals.css`

Steps:
1. Replace the custom parser with `react-markdown`.
2. Enable GFM and syntax-highlighted fenced code blocks.
3. Style headings, paragraphs, lists, nested lists, inline code, block code, blockquotes, links, strong/emphasis, and tables defensively.
4. Preserve safe rendering for empty content and streaming partial content.

## Task 3: Constrain and center the conversation column

Objective: put transcript header, message list content, empty state, and composer on a shared centered axis.

Files:
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

Steps:
1. Introduce a shared conversation container width around 720–768px.
2. Wrap the chat header content in a constrained inner container.
3. Wrap message items in a centered transcript column rather than letting bubbles span the panel width.
4. Make the composer shell use the same centered width.
5. Preserve responsive behavior on narrow screens.

## Task 4: Redesign the composer

Objective: make the composer feel more like a single elevated input card.

Files:
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

Steps:
1. Move the send control inside the composer card.
2. Add an icon-style affordance and compact status badge near the action area.
3. Keep helper copy below the textarea in a muted style.
4. Add a keyboard hint for Enter / Shift+Enter and wire Enter-to-send behavior without breaking multiline input.
5. Keep error handling visible and avoid regressing disabled/loading states.

## Task 5: Refine sidebar structure

Objective: make long history easier to scan and the lower account area feel anchored.

Files:
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

Steps:
1. Add a chat-grouping helper in `app/page.tsx` for Today, Yesterday, Previous 7 days, and month/year buckets.
2. Render grouped sections in the sidebar with labels.
3. Switch preview snippets to single-line truncation.
4. Add a separator below the brand block.
5. Pin the account block to the bottom and add a lightweight avatar treatment.
6. Prefix the new chat CTA with a plus mark.

## Task 6: Improve empty states

Objective: make new and inactive conversations feel intentional rather than blank.

Files:
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

Steps:
1. Add a centered empty-state card when no conversation is selected or a new chat has no messages.
2. Add 3–4 suggestion pills that fill the composer draft.
3. Differentiate between “no chat selected” and “selected but empty” states with copy only, not separate layouts.

## Task 7: Consolidate the auth/landing layout

Objective: turn the signed-out screen into a cohesive split card rather than two floating panels.

Files:
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

Steps:
1. Wrap the hero and auth form in a shared auth frame.
2. Reduce the inter-panel gap and tighten vertical padding.
3. Remove any heavy or dashed-border feel in favor of subtle surface separation.
4. Keep the existing product copy unless a layout change requires minor wording tweaks.

## Task 8: General polish

Objective: clean up the final tactile details.

Files:
- Modify: `app/globals.css`

Steps:
1. Add thin dark-themed scrollbar styling for transcript and sidebar.
2. Improve focus rings for auth inputs, textarea, buttons, and thread items.
3. Add hover and active transitions on sidebar rows and controls.
4. Keep font usage consistent across both signed-out and signed-in surfaces.

## Verification

Run:
- `npm run lint`
- `npm run build`

Manual checks:
- wide screen: centered conversation column with visible gutters
- sidebar: grouped chats, one-line previews, pinned account block
- assistant messages: markdown headings, nested lists, code blocks, inline code
- composer: Enter sends, Shift+Enter inserts newline, send button sits inside card
- empty state: suggestion pills insert starter prompts
- signed-out screen: single cohesive split-card feel
