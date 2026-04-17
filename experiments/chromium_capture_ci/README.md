# Chromium real DisplayItemList + PaintOpBuffer capture via GitHub Actions

This bundle is a repo-ready starting point for a **GitHub Actions–orchestrated** data production pipeline that captures, per sample:

- input HTML or URL
- final screenshot
- normalized page HTML (`document.documentElement.outerHTML`)
- **real Chromium `DisplayItemList` JSON** (via `DisplayItemList::ToString()`)
- **real Chromium `PaintOpBuffer` raw in-memory bytes**
- sample manifest metadata

## Why this design

The cleanest stable hook is inside Chromium itself:

- `DisplayItemList` owns a `PaintOpBuffer`, stores op offsets and visual metadata, and exposes both `EmitTraceSnapshot()` and `ToString()` / `AddToValue(...)` for exporting debug structure. `AddToValue(...)` writes per-item `name`, `visual_rect`, and `skp64` fields, and also emits a layer-level `skp64` snapshot.
- `DisplayItemList::Finalize()` is the natural lifecycle point after recording is complete and before the structure is used downstream.
- `PaintOpBuffer` already exposes `DataBufferForTesting()` and internally stores the raw aligned op bytes in `data_`; we add one tiny accessor to expose the used byte count for dumping.

So the patch in `patches/0001-dump-displayitemlist-and-paintopbuffer.patch` does exactly this:

1. add `raw_used_for_dump()` to `PaintOpBuffer`
2. add a dump helper in `cc/paint/display_item_list.cc`
3. call that helper from `DisplayItemList::Finalize()` when `CHROMIUM_CAPTURE_DUMP_DIR` is set

This gives us **real engine outputs**, not an approximate schema.

## Recommended runner topology

### Recommended

- **Build job** on a **GitHub Actions self-hosted Linux x64 runner**
- **Capture job** on GitHub-hosted or self-hosted runner using the built artifact

Why: Chromium's own Linux build instructions say you want **at least 100GB free disk** and that **more than 16GB RAM is highly recommended** for building Chromium. Hosted runners are often too tight for a full checkout+build.

## High-level flow

### Job 1: build-patched-headless-shell

1. Build the Docker image from `docker/chromium-ci.Dockerfile`
2. Clone `depot_tools`
3. `fetch --nohooks --no-history chromium`
4. `./build/install-build-deps.sh`
5. `gclient runhooks`
6. apply patch
7. `gn gen out/Capture` with release-like args
8. `autoninja -C out/Capture headless_shell`
9. tar the resulting binary + required `.pak` files
10. upload as Actions artifact

### Job 2: capture-dataset

1. download the built artifact
2. run `scripts/run_capture.py`
3. for each sample:
   - create a sample directory
   - write original input
   - set `CHROMIUM_CAPTURE_DUMP_DIR=<sample>/cc_dump`
   - start patched `headless_shell`
   - use CDP to navigate and wait for load
   - save screenshot
   - save normalized HTML
   - stop browser
   - collect dumped `*.display_items.json` and `*.paint_op_buffer.mem`
   - write `manifest.json`
4. upload the dataset directory as Actions artifact

## Dataset directory layout

```text
artifacts/dataset/
  run_manifest.json
  samples/
    case_red_card/
      source.json
      input.html
      page.html
      screenshot.png
      cdp_page_metadata.json
      cc_dump/
        00000000000000000000.display_items.json
        00000000000000000000.paint_op_buffer.mem
      manifest.json
```

## First run recommendation

Use the starter manifest in `manifests/two_cases_local_html.json`. It contains two static local HTML cases and is the safest way to validate the pipeline before moving to larger corpora.
