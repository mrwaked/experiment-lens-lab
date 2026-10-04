# Lens Lab: how a camera lens works

An interactive 3D tour of what happens inside a camera lens. You start with a wide shot of a mirrorless camera and lens, then click through 13 chapters: light bending in glass, rays focusing on the sensor, the aperture closing, and backgrounds melting into bokeh. Every step is animated, and every step has controls and examples you can try.

**Live demo: [lens-lab.mrwakecz.workers.dev](https://lens-lab.mrwakecz.workers.dev)**

The camera is a generic model with the proportions of the Nikon Z5 II, a full-frame stills camera (no video). It comes with three lenses: a 24–120 mm f/4 zoom, a 50 mm f/1.8 and an 85 mm f/1.8.

## What makes it different

- **Real optics, not just pictures.** The rays you see come from a small ray tracer that applies Snell's law surface by surface. It traces a real six-element double-Gauss design scaled to 50 and 85 mm, plus simple, achromatic and aspheric lenses on an optical bench. Focal lengths, focus travel, aberrations and ghost reflections are computed, not hand-drawn.
- **A simulated photo that follows the physics.** A small "viewfinder" shows what the camera would capture of a dusk scene with a robot, string lights and houses. The blur at each pixel comes from the circle-of-confusion formula for the Z5 II's 35.9 × 23.9 mm sensor. Out-of-focus highlights take the shape of the aperture: 5, 7 or 9 blades, rounded or straight, cat's-eye at the frame edges. Vignetting, distortion, colour fringing and flare ghosts are layered on top.
- **Layered explanations.** Each step is written in plain photographer language with real numbers. A collapsible **Deep dive** holds the formulas.
- **No build step, no assets.** Plain HTML, CSS and ES modules. Three.js loads from a CDN, and every 3D model and texture is generated in code.

## The tour

| # | Chapter | What you explore |
|---|---------|------------------|
| 1 | [Meet the camera](https://lens-lab.mrwakecz.workers.dev/#meet-the-camera) | The body, the Z mount, the sensor and the lens, through clickable hotspots |
| 2 | [The light path](https://lens-lab.mrwakecz.workers.dev/#light-path) | X-ray body; the image lands upside down on the sensor; lens vs pinhole |
| 3 | [Refraction](https://lens-lab.mrwakecz.workers.dev/#refraction) | A laser slowing and bending in water, crown and flint glass, and diamond |
| 4 | [Focal point & focal length](https://lens-lab.mrwakecz.workers.dev/#focal-length) | Curvature vs focal length; where the image forms for near and far objects |
| 5 | [Inside the lens](https://lens-lab.mrwakecz.workers.dev/#inside-the-lens) | A cutaway of the elements, with traced ray bundles from the centre to the corner |
| 6 | [Angle of view](https://lens-lab.mrwakecz.workers.dev/#angle-of-view) | 24–200 mm in the scene, and why "compression" really comes from distance |
| 7 | [Focusing](https://lens-lab.mrwakecz.workers.dev/#focusing) | Moving the glass to put the image on the sensor; minimum focus distance |
| 8 | [Aperture](https://lens-lab.mrwakecz.workers.dev/#aperture) | The iris from f/1.8 to f/16, stops of light and shutter speed |
| 9 | [Depth of field](https://lens-lab.mrwakecz.workers.dev/#depth-of-field) | The sharp zone in 3D, a blur map and the hyperfocal distance |
| 10 | [Bokeh](https://lens-lab.mrwakecz.workers.dev/#bokeh) | Aperture-shaped highlights, blade count, cat's-eye, and what makes blur bigger |
| 11 | [Sharpness](https://lens-lab.mrwakecz.workers.dev/#sharpness) | Spherical and chromatic aberration, diffraction, the sweet spot, distortion |
| 12 | [Coatings & flare](https://lens-lab.mrwakecz.workers.dev/#coatings) | Ghost reflections and how anti-reflection coatings stop them |
| 13 | [Playground](https://lens-lab.mrwakecz.workers.dev/#playground) | Every control at once, scenario presets, and "take a photo" to download a JPEG |

### Controls

- **Next / Back**, or the <kbd>←</kbd> <kbd>→</kbd> keys, step through the tour. The chapter list on the left jumps directly.
- **Drag** to orbit, **scroll** to zoom, <kbd>R</kbd> to reset the view.
- Every step has its own link, such as `#bokeh` or `#aperture/3`.
- Add `?debug` to the URL for an FPS meter and a panel with the main lens settings.

## Running it locally

ES modules don't load from `file://`, so serve the folder with any static web server:

```bash
python3 -m http.server 5173
```

Then open <http://localhost:5173>. You need an internet connection, because Three.js r186 and the fonts load from jsDelivr and Google Fonts.

**Browser support:** any current Chrome, Edge, Firefox or Safari with WebGL 2 and import maps. Animations are shortened when `prefers-reduced-motion` is on.

## Tests

The optics and photography maths are pure JavaScript modules with unit tests. You need Node 20 or newer; there is nothing to install.

```bash
node --test tests/
```

The tests check the double-Gauss focal length against its reference value, spherical aberration, achromat vs singlet colour spread, the aberration-free conic asphere, total internal reflection, Fresnel losses, focusing, depth of field, hyperfocal distance, angle of view, diffraction and exposure.

## Deploying

It's a static site, so any static host works. Publish `index.html`, `styles.css` and `src/`.

**Cloudflare Workers** (static assets; Wrangler needs Node 22 or newer):

```bash
rm -rf /tmp/lens-lab-dist && mkdir /tmp/lens-lab-dist && cp -R index.html styles.css src /tmp/lens-lab-dist/
```

```bash
npx wrangler@latest deploy --assets /tmp/lens-lab-dist --name lens-lab --compatibility-date 2026-09-26
```

**GitHub Pages:** turn on Pages for the branch root. All paths are relative, so it works from a project subpath too.

## Project structure

```
index.html              page shell, import map, loader and error screen
styles.css              all UI styling (dark studio theme)
src/
  main.js               bootstrap: scene, models, simulated photo, tour, frame loop
  state.js              lens presets, parameter schema, shared store, derived values
  core/                 renderer and camera framing (stage.js), tweens and scopes (tween.js)
  optics/               glass catalogue, 2D ray tracer, lens designs, photo maths (no Three.js)
  models/               procedural camera body, lens barrels, cutaway, iris, rays, bench, diorama
  preview/              the simulated photo: depth-based blur, shaped bokeh, lens effects
  ui/                   tour state machine, tutorial card, controls, hotspots, charts
  chapters/             one module per chapter: steps, text, controls, examples
tests/                  node:test suites for optics and photo maths
```

## Accuracy and simplifications

This is a teaching tool, so a few things are simplified on purpose:

- The camera is a generic model with Z5 II proportions and specs (24.5 MP, 35.9 × 23.9 mm sensor, 16 mm flange distance). It is not an accurate replica.
- The ray tracer works in a single plane through the axis. 3D light cones are built by rotating those traces around the axis.
- The 50 and 85 mm cutaways use a classic textbook double-Gauss design, not Nikon's actual optical formulas. The zoom is shown from the outside only.
- Depth of field uses a 0.03 mm circle of confusion, the usual full-frame value.
- The simulated photo is a real-time approximation: thin-lens blur sizes with an aperture-shaped gather blur, not a full spectral render.

## Built with

- [Three.js](https://threejs.org) r186 (WebGL renderer, OrbitControls, CSS2DRenderer, fat lines)
- [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif), [IBM Plex Sans and Plex Mono](https://www.ibm.com/plex/)

## License

[MIT](LICENSE)

Nikon, Z5 II and Z mount are trademarks of Nikon Corporation. This project is not affiliated with or endorsed by Nikon.
