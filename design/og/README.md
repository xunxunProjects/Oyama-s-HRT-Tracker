# Link preview picture

`og.html` is the source of `public/og.png`, the 1200 by 630 picture shown when
a link to hrt.mahiro.uk is shared (the `og:image` and `twitter:image` tags in
`index.html`).

It follows the app's design system: the white page, the system type stack,
`text` and `text-muted` for the words, the 2px-style chart line in `brand` with
hollow dose rings, and the route doodles from `src/components/Doodle.tsx` on
`surface-muted` tiles, as in the app's rows. The sleeping cat is the one from
the privacy poster, in the same pen. The curve is four doses of a simple absorb
and clear model; it is a picture, not a real estimate.

To regenerate after an edit:

```sh
npx -p playwright node design/og/render.cjs
```

That overwrites `public/og.png`. On a Mac the title renders in SF Pro; on a
machine without it, Inter or Helvetica stands in.
