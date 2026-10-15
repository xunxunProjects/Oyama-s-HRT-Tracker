# README pictures

`hero.html` is the source of `docs/images/hero-light.png` and
`hero-dark.png`, the picture at the top of the README. It follows the app's
design system: the white page (warm near-black in dark), the system type stack,
`text` and `text-muted` for the words, route doodles from
`src/components/Doodle.tsx` on `surface-muted` tiles, and real app screenshots
in frames with a `border` hairline and `shadow-md`.

`render.cjs` also takes the six screenshots in `docs/images`
(`screenshot-<page>-<theme>.png`), at phone size (393 by 852, twice the
pixels), in English. Before the app loads it writes the sample records in
`seed.js`: weekly 4 mg estradiol valerate injections for twelve weeks, with
two trough lab results. The curve and figures on screen are the app's own model
output for those records.

To regenerate, start the app and run:

```sh
npm run dev
npm install --no-save playwright
npx playwright install chromium
node design/readme/render.cjs http://localhost:5173/
```

Run it on a Mac, so the words are set in SF Pro like the app; elsewhere another
sans stands in.
