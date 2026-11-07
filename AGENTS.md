# Design sandbox

Read [PRODUCT.md](PRODUCT.md) for what the sandbox is for. Read [REFERENCES.md](REFERENCES.md) when picking a style or technique, and add a line under "Tried" there once an experiment's kit is ready.

## Experiments

Each experiment lives in `experiments/<slug>/`, with its own dependencies and its own `.gitignore`. That file holds the standard web block from `experiments/oled-wallpaper/.gitignore`, plus the experiment's own outputs.

Its `README.md` opens with:

- **Track**: poster, texture and shader, micro-interaction, agent interface, or a new one
- **Style**: the look, in a few words
- **Technique**: how it's made, in a sentence
- **Learned from**: the REFERENCES.md entries it borrows from, when it borrows
- **Status**: `exploring`, `kit ready` or `dropped`
- **Run**: the command that starts it
- **Credits**: each font, photo and icon with its source and license, when there are any

## Post kit

Every experiment ends in a post kit in `experiments/<slug>/post/`, committed with the experiment. One aspect ratio per piece: 1:1 by default, 16:9 for wide or UI pieces.

- `<slug>.png`: the finished still, under 5 MB. When the piece has a clip, this is its first frame.
- `<slug>.mp4`: when motion or interaction carries the idea. 7 to 15 s at 1080×1080 or 1920×1080, H.264 High, `yuv420p`, 30 fps, no audio, faststart. It opens on a readable frame and ends on purpose. Loop it seamlessly when the piece suits a loop.
- `<slug>-2.png` to `<slug>-4.png`: when there's no clip, one to three more stills, each showing a different side of the design, such as a variant, a detail crop or another state. X takes up to 4 images per post.
- `breakdown/`: optional, up to 4 PNGs, one per layer or pass, when the technique is the story.
- `notes.md`: the piece's point in one line, the technique in a sentence or two, alt text for each image and the clip, and credits. Post text is drafted outside this repo, from this file.

An interactive piece draws its own cursor and replays a scripted pointer path, so every capture shows the same take. The clip shows the piece at rest, the pointer approaching, one action, and the result held long enough to read, then it resets.

The kit is ready when `ffprobe` shows the clip matches the spec, each PNG is under 5 MB, and fine texture survives the X check below.

### Checking what X viewers see

X plays video at 720p for viewers without a subscription and recompresses every upload. This approximates the result:

```sh
ffmpeg -i post/<slug>.mp4 -vf scale=-2:720 -c:v libx264 -b:v 2M -maxrate 2M -bufsize 4M -pix_fmt yuv420p -an /tmp/<slug>-x.mp4
```

Watch it in QuickTime with the window about 390 points wide, the width of a phone feed. If dither, grain, halftone or small type turns to mush, make it coarser and export again. X doesn't document its re-encode, so compare this check with the first real upload and adjust it. Install ffmpeg with `brew install ffmpeg` when it's missing.
