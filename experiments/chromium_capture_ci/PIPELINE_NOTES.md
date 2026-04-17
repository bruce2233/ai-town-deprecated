# Notes grounded in upstream Chromium / GitHub materials

- Chromium's `DisplayItemList` is a container of paint operations and internally owns a `PaintOpBuffer`; it also exposes `ToString()`, `EmitTraceSnapshot()`, and `AddToValue(...)` for debug export.
- In `display_item_list.cc`, `EmitTraceSnapshot()` writes snapshots under the trace categories `cc.debug.display_items`, `cc.debug.picture`, and `devtools.timeline.picture`.
- `AddToValue(...)` emits, for each item, the paint op `name`, `visual_rect`, and `skp64`, and also writes a layer-level `skp64`.
- `Finalize()` is the point where the RTree is built, transient recording metadata is cleared, and the `PaintOpBuffer` is shrunk to fit.
- `PaintOpBuffer` uses 8-byte alignment (`kPaintOpAlign = 8`) and stores its raw byte buffer in `data_`; `DataBufferForTesting()` exposes the underlying byte pointer.
- Chromium's Linux build instructions explicitly recommend at least 100GB free disk and say more than 16GB RAM is highly recommended.
- Chromium also documents a Docker-based compile flow, but it is explicitly presented as a non-common setup.
- The `headless/BUILD.gn` file defines the `headless_shell` executable target.
- For GitHub Actions environments, `browser-actions/setup-chrome` can install Chrome/Chromium and matching ChromeDriver on runners, while `alpine-chrome` is a widely used headless Chromium Docker image pattern.