# References

Posts and accounts worth learning from, and the styles tried here or worth trying.

Learn the technique, never recreate a specific piece. Take how an effect works and apply it to your own subject, composition, palette and type. When a piece borrows a technique, its README names the reference under "Learned from".

## Posts

Observed on 2026-11-07, with likes as of that day.

- [@praveenisomer](https://x.com/praveenisomer/status/2118667212974428551), dithered classical objects. Image, 1,376 likes and 774 bookmarks. A chess knight and the Creation of Adam hands in one-ink dither on white, made with Figma shaders. Study how dot density alone carries the tone, on a subject everyone knows. Here that's a fragment shader thresholding brightness against a Bayer matrix or blue noise, on a public-domain photo.
- [@kshvbgde](https://x.com/kshvbgde/status/2118441467421348008), an agent thinking on a whiteboard. Video, 7 likes. The agent's search steps appear as pen strokes on a dotted board. Study the agent's process shown as drawing instead of a log. Here that's SVG paths revealed with `stroke-dashoffset`, timed to streamed steps.
- [@nexvyn](https://x.com/nexvyn/status/2118939001218293998), "Soft Bloom". 15 s video, 7 likes. Iridescent flowers in raw WebGL whose petals rise as the cursor traces them. Study thin-film iridescence, and geometry that answers the cursor's path rather than its position. Here that's a hue shift by view angle in the fragment shader, and vertex displacement from a fading trail of pointer positions, on a form of your own.
- [@ctatedev](https://x.com/ctatedev/status/2118853661040295997), generative UI in chat. Video, 2,191 likes, a product launch. Agent replies arrive as native cards in Slack and Teams. Study a reply that arrives as structured UI instead of text. Here that's a streamed response that settles into a card as its fields arrive.
- [@nickbakeddesign](https://x.com/nickbakeddesign/status/2118770981821202936), motion brand posters. Four 10 s videos, 155 likes. Industrial spec labels on cables, scan-line photos, architectural line work. Study technical labels used as type, and photos rebuilt from scan lines. Here that's a canvas redrawing a photo one line at a time, with monospace labels set on a grid.
- [@dev_TEMITAYO](https://x.com/dev_TEMITAYO/status/2118775706914353203), file upload as a basketball shot. 7 s video, 3,622 likes. "Drop files here or take the shot." Study a physics metaphor that makes a dull control playful, explained in one line. Here that means a different control and a different metaphor.
- [@ArjunGfx](https://x.com/ArjunGfx/status/2118560254158078261), grayscale posters. Image, 2,010 likes. Photocopy grain, halftone photos, Swiss type on visible grids. Study halftone and photocopy texture as the whole palette, with the grid left visible. Here that's a halftone of a public-domain photo, threshold noise for the photocopy grain, and type set on a drawn grid.
- [@guerriero_se](https://x.com/guerriero_se/status/2118730878905979040), dot-matrix icons. 10 s video, 41 likes. Pixel icons on a dot grid morph into each other. Study one shared grid of dots that every icon is drawn from. Here that's each dot easing between on and off, staggered by its distance from a point.
- [@pulpxstyle](https://x.com/pulpxstyle/status/2118622125745688911), dusty gradient swatches. Image, 180 likes. Collections of muted, dusty gradients. Study low-saturation palettes, and grain that stops gradients from banding. Here that's gradients in OKLCH with a fine noise layer.

## Accounts

- [@jh3yy](https://x.com/jh3yy): one interaction per clip, with the CSS or JS trick in the post text. "many can build it. few can explain it."
- [@iamncdai](https://x.com/iamncdai): ships each experiment as an installable shadcn registry component, with an open-source portfolio.
- [@zzzzshawn](https://x.com/zzzzshawn): design engineer, posting past-work reels and SVG experiments.
- [@sofianedesign](https://x.com/sofianedesign): not yet observed.

## What these posts share

A starting format seen across the nine posts on 2026-11-07, not a set of rules. One idea per post, a 7 to 15 s loop with a readable first frame, one line of text, and care in texture and type. Tejas's read is that the accounts that grow are the ones explaining their technique.

## Styles

### Tried

One line per experiment. Its status lives in its README.

- Path-traced object on exact black: [oled-wallpaper](experiments/oled-wallpaper/)

Elsewhere: dither plus a little ascii, hover to explore, click to flip the filter. That's Tejas's site hero, on his personal laptop.

### Worth trying

Poster studies

- A halftone photo poster with photocopy grain on a visible Swiss grid, whose motion version shifts the screen angle or the grid.
- A two-colour risograph overprint whose misregistration drifts with the cursor.
- Technical spec labels and line work set as type.

Texture and shader studies

- Ordered (Bayer) and blue-noise dither on a public-domain object, with the threshold under the cursor.
- Halftone screens at the classic CMYK angles.
- ascii shading from brightness, mixed with dither.
- Scan-line and slit-scan photos. Slit-scan comes from film and video.
- Paper warp and liquid edges with `feTurbulence` and `feDisplacementMap`.
- Thin-film iridescence on a form that answers the cursor.
- Grainy, muted gradient sets.
- Film emulation: grain, halation, gate weave.

Micro-interactions

- A physics metaphor for a dull control.
- Icons morphing on a shared dot grid.

Interfaces for AI agents

- An agent's thinking drawn as pen strokes.
- Tool calls that stream in as cards.
- A reply that settles from text into UI.
