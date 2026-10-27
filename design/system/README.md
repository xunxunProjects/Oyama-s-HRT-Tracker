# Oyama design system, v3 (1.5.1)

v2's colours, type scale, spacing, shapes and the desktop sidebar carry over
unchanged. v3 overturns the parts that made the app feel generic: a borrowed
icon library, fields that light up, dialogs that cover the page, and motion
with no system behind it. The tokens are in `src/styles/oyama-tokens.css`,
every animation in `src/styles/motion.css`, and the components below in
`src/components`.

## What it should feel like

A calm, precise instrument kept by hand. A white page, warm neutrals, one
terracotta accent, large light numerals, and everything that isn't a number
drawn with the same pen as the doodles. Nothing performs; things settle.

## Rules

- **Drawn, not borrowed.** Every icon is one of ours (`components/icons`). No
  icon library, no stock glyph, no emoji in the interface.
- **No pop-ups.** No modal, sheet, dropdown menu or popover. A question is a
  line in the page under what was pressed; a form is a page with a back link
  or a fold in place; a choice is a list with a tick.
- **Ink, not glow.** Focus and emphasis are drawn as a pen line. No glow, no
  coloured focus ring on a field, no red outline on an error: the hint under
  the field says what's wrong, in words.
- **Sentence case, no full stop on titles.** "Log a dose", not "Log A Dose" or
  "LOG A DOSE". Group headings too (`.group-heading`, never uppercase).
- **Phrases, not dots.** Never join facts with `·` or `•`. Write "4 mg of
  estradiol valerate, injected on 23 Oct", or two short sentences.
- **Hairline rows, not cards.** Lists are rows divided by hairlines under a
  short heading. One primary action per view.
- **Buttons are capsules.** 36px tall (30px for `btn-sm` inside a line of
  text), fully round at the ends, whatever their colour.

## Icons

`components/icons/glyphs.ts` holds every glyph on a 24px grid: one ink, round
caps and joins, strokes a little off true, outlines that run a touch past
where they began. No jitter, so nothing reads as shaky, and every enclosed
space stays at least 3px across so it still reads open at a 1.75 stroke.

- Use the named components (`Plus`, `Trash`, `Calendar`…) or `<Icon name>`.
  They take `size`, `strokeWidth` (1.75 at rest, 2 for the current thing),
  `className` and `label` (only when nothing beside the icon names it).
- Every path carries `pathLength="1"`, so any stroke can be drawn on with one
  dash pattern (`.ink-draw`, `.tick-draw`).
- A glyph can have depth in its own ink: a `tint` stroke washes a shape with
  the ink at 28% (the sample in the Labs tube) and a `thin` stroke is a
  lighter line (an edge seen through glass, a glint), so it still turns
  terracotta as one colour when it's the current tab.
- To add one, draw it in the same hand, add it to `GLYPHS`, export a
  component from `index.tsx`, and check it at 20px and 48px.
- Never a key, never a fingerprint. Passwords are `password` (a field of
  hidden characters), recovery codes `codes`, and a passkey is drawn as the
  `devices` it lives on.
- No marks radiating off a drawing to make it look special.

Doodles (`Doodle.tsx`, `DoseDoodle.tsx`…) are the larger drawings: one line
colour and a flat wash. The injection syringe alone has volume, from
`--illustration-shade`, `--illustration-deep` and a `--illustration-shine`
glint, so the one route that's a needle reads as a solid thing in the hand.

## Fields

`.input-base` is a line, not a box: a hand-drawn rule (`--ink-rule`) under the
text, and on focus an ink stroke (`--ink-stroke`) drawn over it from left to
right in `--duration-ink`. Labels are `.field-label` above the line; hints and
errors are `.field-hint` / `.field-hint.is-error` under it. A text area keeps
a box (several lines don't sit on one rule) whose hairline darkens to the text
colour on focus. Keyboard focus on everything else is one ring of ink.

## Without pop-ups

- **Prompts.** `showDialog('alert' | 'confirm', …)` keeps its API, but the
  question is put into the page as a line right under the row that was
  pressed ("Delete this dose? Keep it / Delete"). A destructive confirm says
  "Keep it" and takes the focus. With nothing pressed (a sync finishing on its
  own) it floats at the top of the page. Escape, Back or the page going away
  backs out of it. A row can name itself with `data-prompt-anchor` if the
  layout would mislead the search for "the row".
- **Asking for more.** `useInlineHost(open)` gives a place under what was
  pressed for a bigger line to render into: the password prompt
  (`PasswordPrompt`), a picker opened from a button, an admin panel.
- **Choices.** `CustomSelect` is a line like a field whose options unfold in
  place under it as rows with a tick.
- **Dates.** `DateTimePicker` is a month calendar with the chosen day circled
  in ink as it's picked, and the time typed as two digits under it.
- **Pages.** Signing in, the disclaimer and adding to the plan are pages, not
  layers over the app, so the sidebar and the way back stay where they are.

## Motion

The rules: motion says what changed; one action, one motion; ink, not glow;
settle, don't bounce; reduced motion lands everything on its final frame.

| Token                | Value                               | For                                |
| -------------------- | ----------------------------------- | ---------------------------------- |
| `--duration-instant` | 90ms                                | a press (buttons scale to 0.97)    |
| `--duration-quick`   | 150ms                               | a colour change, hover             |
| `--duration-base`    | 220ms                               | a change of state, a tick          |
| `--duration-slow`    | 320ms                               | something unfolding                |
| `--duration-page`    | 380ms                               | a page move                        |
| `--duration-ink`     | 560ms                               | a pen stroke (fields, the ring)    |
| `--duration-sweep`   | 900ms                               | the chart line                     |
| `--ease-out`         | `cubic-bezier(0.16, 1, 0.3, 1)`     | anything that moves                |
| `--ease-page`        | `cubic-bezier(0.32, 0.72, 0, 1)`    | pages                              |
| `--ease-ink`         | `cubic-bezier(0.55, 0.05, 0.25, 1)` | a pen: slow off, steady, slow onto |

- **Pages** (`motion/viewMove.ts`): on a phone `push` slides the new page in
  over the old one and `pop` slides it away again; a wide window puts the new
  page down 24px to the side and lets it settle. Only the page area takes part
  (`.main-view`), and it's captured on the page colour: pages never fade
  through each other, because a cross-fade lets the background show through
  and reads as a flash. A sibling page or another tab's page is simply there.
- **Menus.** A tab chosen in the sidebar or the bottom bar is simply there. The
  bottom bar's one motion is its tonal pill gliding to the tab that was tapped
  (`.chip-slide`); the sidebar doesn't move.
- **In place**: `.m-appear` for a line put into the page, `.disclosure` for a
  fold (grid rows 0fr to 1fr), `.chip-slide` for an indicator that follows.
- **Ink**: `.ink-draw` draws any stroke on (the calendar's ring);
  `.tick-draw` writes a tick short leg first.
- **Labels that change** (`SwapLabel`): the button keeps the longer label's
  width, both labels start right after the icon (4px from it), and the old
  label rolls up and out as the new one rolls in. A plus that means "add"
  turns into a cross (`.chev`) as its label becomes "Cancel"; a copy mark
  becomes a tick (`CopyTick`).
- **Waiting**: a busy mark only appears after 300ms and turns slowly.
- Nothing else loops, except the pixel cats.
