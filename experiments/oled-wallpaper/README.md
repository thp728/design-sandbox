# OLED wallpaper

- **Track**: texture and shader
- **Style**: one sculpted ribbon, path-traced, lit against exact black
- **Technique**: seeded ribbon geometry path-traced with three-gpu-pathtracer on WebGPU in headless Chrome, with a black point that holds the background at 0,0,0
- **Status**: exploring
- **Run**: `npm install`, then `node cli/wallpaper.mjs serve` for the studio page, or `node cli/wallpaper.mjs random --count 12` for a sweep of drafts

[PLAN.md](PLAN.md) holds the decisions, parameter schema, CLI and test cases. Its status line predates the stage A build.
