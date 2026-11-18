# Photo fitting: checking a model against real photos from every angle

These tools compare a playne model with real photos and measure how well the outlines agree.
They found most of the shape errors fixed in November 2026 (fins too far forward, wrong spans and
lengths, belly fairings, tail cones).

## Set up (once per session)

    python3 -m venv /tmp/pfenv && /tmp/pfenv/bin/pip install opencv-python-headless pillow onnxruntime
    export PY=/tmp/pfenv/bin/python
    mkdir -p segmodel && curl -sSL -o segmodel/isnet.onnx \
      https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx

Run everything from this folder. Each playne gets a working folder named after its id (ignored by git).

## The steps

1. `python3 fetchcat.py <id> 48 "<Commons category>"`: 48 thumbnails from a Wikimedia Commons
   category and its subcategories (or `"q:search words"`), with a numbered contact sheet
   `<id>/sheet.jpg`. Be gentle: Commons rate-limits; one type at a time.
2. `bash auto.sh <id> <model id> 12`: fetches 1280 px copies (or the numbers in `<id>/pick.txt`),
   cuts the playne out of each photo (`seg.py`: `sky` for plain sky, `net` for anything else),
   drops cut-outs that do not look like one whole playne (`qual.py`), and fits each photo
   (`fit.cjs`): it searches the camera angle (and roll and lens) where the model's outline best
   overlaps the photo's. `comp.py` writes `<photo>.cmp.jpg`: the photo with both outlines, the
   model from that angle, and a difference picture (red: only in the photo; blue: only in the
   model). Gear is `down`, `up` or `land` (gear and flaps down).
3. `bash mkphotos.sh <id> 0.78` keeps the photos that fitted well (`<id>/photos.txt`);
   `bash angles.sh <id>` lists their angles. Look at the difference pictures
   (`python3 diffsheet.py out.jpg <id>/b0*.cmp.jpg`): a colour that sits on the same part in
   most photos is a real shape error; a one-off is usually the photo (stores, flaps, shadows).
4. Kit jets only (`scripts/spec-*.mjs`): `python3 mkparams.py <id>` writes a list of shape
   parameters, and `node tune.cjs <id> <id>/photos.txt <id>/params.json 2` tries each one in
   both directions (building the model in under a second with `FAST=1 SPEC_PATCH=...`) and keeps a
   change only if the photos agree (better on average, and more photos better than worse), with
   a penalty for straying from the published span and length. Run one tuner at a time
   (`tdaemon.sh` runs a queue from `tq.txt`): two at once overwrite each other's test model.
   Paths can be `a|b` (both together) and `<id>.@nose` / `<id>.@tail` (stretch that end).
5. Put the result in the spec's `photoFit` list (applied by `scripts/build-models.mjs`), rebuild,
   check with `bash recheck.sh <id> /var2/<id>.glb` after a `FAST=1 OUT_DIR=tools/photofit/var2`
   build, run the gear check, and look at the model before committing: the tuner only sees
   outlines, so check by eye that nothing looks odd (e.g. a nose squashed out of shape).

`node dims.cjs <id>...` prints each model's true span, length and height against the published
figures (note it counts hidden parts such as the afterburner flame).

## Limits

Outlines say nothing about colours or details inside the outline, and thin parts (wings seen
edge-on, gear legs, aerials) are often lost in the cut-out. Hand-built models (Cessna, Phenom
300E, F-16, Chinook) can be fitted and compared, but not tuned automatically.

## Manufacturer three-view drawings (exact scale)

Better than photos where a maker publishes a dimensioned three-view. `drawings/specs.json` says
which page image and which pixel box holds each view (side, top, front), the published length and
span, and how to read it (`kind`: line art by default, `net` for a render, `netplus` views,
`rot` to turn a view upright, `nogear`). Put the page image (rendered from the maker's PDF with
`pdftoppm -r 400`) in `drawings/` (not committed: it is the maker's artwork), then:

    python3 drawsil.py <jet>            # outlines -> drawings/<jet>_<view>_sil.png, px per metre
    python3 dcmp.py <jet>               # model vs drawing, drawings/<jet>_cmp.jpg, IoU per view
    python3 mkdparams.py <jet>          # parameter list for the tuner
    python3 drawtune.py <jet> drawings/<jet>_params.json 2 [start.json]

`drawtune.py` keeps a change only if the mean outline overlap improves, with a penalty for any
change to the published length or span (without it the tuner "wins" by stretching the nose).
Sources used (Nov 2026): HondaJet Elite II brochure (Honda, technical specifications page),
Falcon 8X press pack (Dassault, Sept 2020, page 8), Citation Latitude Specification and
Description (Textron, Oct 2015, page 4: front/side renders, top view rotated 45 degrees), PC-24
Just The Facts (Pilatus, page 4: side render).
