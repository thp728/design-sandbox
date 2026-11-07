# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Chosen per experiment. The default is plain HTML, CSS and JS in the experiment folder, with no build step. Compositing happens in code: WebGL and GLSL, SVG filters (`feTurbulence`, `feDisplacementMap`, `feColorMatrix`), Canvas, and three.js. Playwright captures stills and ffmpeg encodes clips. This Mac has no Photoshop, Illustrator or Figma.

## Users

Tejas Page builds and judges the pieces. The audience is people on X who follow design engineering and creative coding. They meet each piece as a post: a clip or a few stills, and a line of text.

## Product Purpose

A sandbox for exploring visual styles and making original pieces to post on X. It feeds the design engineering and creative coding side of Tejas's public profile as a product engineer. His eye comes from Photoshop and Illustrator compositing in college and from videography, so the work leans on texture, compositing and motion.

Each experiment tries one style and one technique, and ends in a post kit, which AGENTS.md defines. A piece succeeds when it's worth posting and Tejas can explain how it's made.

Starting tracks, not limits:

- Poster studies: print-style compositing in code, as stills or a short motion version.
- Texture and shader studies: dither, halftone, ascii, grain, displacement.
- Micro-interactions, each with its technique explained.
- Interfaces for AI agents: thinking, streaming, tool calls.

An idea worth coming back to is rebuilding a print technique so it moves and reacts to input.

## Operating Context

Coding agents in T3 Code (Cursor and Codex) build the experiments. Impeccable is installed for both, and three.js skills sit in `.agents/skills/`. The repo is local only. Pieces leave it as post kits, and Tejas posts by hand. Hand compositing happens on his personal laptop and stays out of this repo.

## Capabilities and Constraints

- Subjects are personal or fictional. No employer or client material.
- Fonts, images and icons must be licensed for public use, since any piece may be posted. Each experiment's README credits every source with its license.
- Photo sources for compositing, with terms checked on 2026-11-07. Check each image's own page before using it.
  - [The Met Open Access](https://www.metmuseum.org/policies/image-resources). Images marked Open Access are CC0 and free for any use. Trademark and publicity rights can still apply, and nothing may imply the Met endorses the work.
  - [NASA images and media](https://www.nasa.gov/nasa-brand-center/images-and-media/). Generally not copyrighted. Credit NASA, leave out its insignia and logos, and don't imply endorsement. Images marked as third-party copyright are excluded, and commercial use of a recognizable person needs their permission.
  - [Unsplash](https://unsplash.com/license). Free, including commercial use, with no credit required. Photos may not be compiled into a competing service or sold unaltered. The license is only as good as the uploader's rights, so record each photo's page URL.

## Evidence on Hand

The best-performing post so far is Tejas's site hero: dither plus a little ascii, hover to explore, click to flip the filter. It lives on his personal laptop, not here. The sandbox has no users, testimonials or metrics. Experiments may use invented data but must never present it as real.

## Product Principles

- One idea per piece.
- Each piece names its style and technique, and the technique fits in a sentence or two.
- Learn the technique, never recreate the piece: take how an effect works and apply it to your own subject, composition and palette. [REFERENCES.md](REFERENCES.md) holds the references.
- Each experiment is self-contained in its own folder. Nothing becomes shared tooling until a second experiment needs it.

## Accessibility & Inclusion

No sandbox-wide standard. Each experiment sets its own, and every post kit carries alt text.
