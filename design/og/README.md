# Link preview picture

`og.html` is the source of `public/og.png`, the 1200 by 630 picture shown when
a link to hrt.mahiro.uk is shared (the `og:image` and `twitter:image` tags in
`index.html`).

It follows the app's design system: the white page, the system type stack,
`text` and `text-muted` for the words, axes and figures, `chart-grid` lines, and
the chart line in `brand` with hollow dose rings, as on the Overview. Three route doodles from
`src/components/Doodle.tsx` sit on `surface-muted` tiles, as in the app's rows.
The curve
is real model output: weekly 5 mg estradiol valerate injections at 70 kg, run
through `runSimulation` in `logic.ts` and sampled every 6 hours for 42 days.

To regenerate after an edit:

```sh
npx -p playwright node design/og/render.cjs
```

That overwrites `public/og.png`. Run it on a Mac, so the words are set in SF Pro
like the app; elsewhere another sans stands in.
