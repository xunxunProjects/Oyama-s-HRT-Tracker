# Link preview picture

`og.html` is the source of `public/og.png`, the 1200 by 630 picture shown when
a link to hrt.mahiro.uk is shared (the `og:image` and `twitter:image` tags in
`index.html`).

It follows the app's design system: the white page, the system type stack,
`text` and `text-muted` for the words and axes, and the chart line in `brand`
with hollow dose rings, as on the Overview. The curve is four doses of a simple
absorb and clear model; it is a picture, not a real estimate.

To regenerate after an edit:

```sh
npx -p playwright node design/og/render.cjs
```

That overwrites `public/og.png`. Run it on a Mac, so the words are set in SF Pro
like the app; elsewhere another sans stands in.
