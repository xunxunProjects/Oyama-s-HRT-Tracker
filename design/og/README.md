# Link preview picture

`og.html` is the source of `public/og.png`, the 1200 by 630 picture shown when
a link to hrt.mahiro.uk is shared (the `og:image` and `twitter:image` tags in
`index.html`).

The drawings are copied from the app's own: the four doses from
`src/components/Doodle.tsx` and the sleeping cat from the privacy poster. The
curve is four doses of a simple absorb and clear model, so it climbs the way the
Overview does; it is a picture, not a real estimate.

To regenerate after an edit:

```sh
npx -p playwright node design/og/render.cjs
```

That overwrites `public/og.png`. Opening `og.html` in a browser at 1200 by 630
shows the same thing.

Caveat and Newsreader are under the SIL Open Font License, in `fonts/OFL.txt`.
