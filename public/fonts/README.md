# Fonts — Urdu Nastaliq driver slip (Gate Pass D)

The Urdu driver slip (`modules/shared/components/UrduDriverSlip.tsx`) renders in
**Nastaliq** calligraphy.

## Shipped — `NotoNastaliqUrdu.woff2`

`NotoNastaliqUrdu.woff2` (Noto Nastaliq Urdu, **SIL OFL 1.1** — free to embed) is
bundled and self-hosted via `@font-face` in
`modules/shared/components/urduSlip.css` (family `GT Nastaliq`). This means the
slip renders true Nastaliq on **any** device — Windows, Android, iOS, a bare
Linux box — with zero OS dependency. Nothing else is required.

## Optional — swap in a different Nastaliq style

Prefer the **Jameel Noori Nastaleeq** / **Alvi Nastaleeq** look? Drop a
web-embeddable `.woff2` here named exactly:

```
public/fonts/JameelNooriNastaleeq.woff2
```

The stylesheet lists it as a second `@font-face` for the same `GT Nastaliq`
family, so if present it overrides Noto — no code change needed. (Convert a
`.ttf`/`.otf` with any "ttf to woff2" tool or `woff2_compress font.ttf`.)
