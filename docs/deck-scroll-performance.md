# Deck scrolling performance checks

The scrolling changes have three independent responsibilities:

- Keep Drawer cards mounted while their displayed pose or swept path can still
  intersect the pane, then release them during sustained transitions.
- Process every input in order, while coalescing visual updates into one frame.
  Reuse bookmark edge buttons when their target and presentation stay the same.
- Cache the current anchor index for an immutable filed-card snapshot. Hold the
  snapshot weakly and resolve again when its identity or the anchor path changes.

These changes preserve the wheel distance, anchor hysteresis, card dimensions,
180 ms Drawer reading-gap transition, and Fan paint containment/surface caching.
Wheel displacement translates cached transition poses directly so repeated
anchor changes cannot restart easing for the gesture itself. Keyboard and click
navigation retain their existing animated positioning.

Vertical wheel routing keeps a gesture with the Deck after browsing starts,
including reversals, selection changes, and retargeting to the new anchor body.
A 180 ms pause ends ownership, so a new gesture can scroll the focused body.
Editor and Branch View input still takes precedence. Keep the event's card mounted
while it owns the gesture; removing an off-screen target would prevent later
events from reaching the stage. An idle timer releases it and refreshes the window.
Body-first boundary resistance subtracts at most the remaining portion of 48 px
and forwards any excess immediately, independent of the event's size.

## Repeatable live comparison

Use a disposable Obsidian vault and production bundles from the baseline and each
checkpoint. Save settings, viewport, focus and session-only Desk state before
reloading the plugin. Restore them after each run. Record the bundle hash, Obsidian
and Chromium versions, pane dimensions, display scale and filed-card count.

Run vertical Drawer and Fan at spreads 0.10 and 0.58 with Medium cards, zero tilt,
Branch View enabled and direct Deck wheel routing. Keep the pane size and developer
tools state fixed. Warm up each configuration, then repeat three times:

1. Send 120 wheel events per second to the real stage listener, using deltas for
   ten card steps per second. Travel forward for 20 seconds and backward for 20.
2. Verify that every event is accepted, forward travel is 200 cards, and the final
   viewport returns to the starting position. Record scheduled and actual input
   timestamps; do not silently drop late events.
3. Capture raw animation-frame intervals, long tasks and mounted-card counts.
   Report the median of per-run mean and p95 intervals, plus peak mounted count.
4. Rebuild and settle the view before the next repetition. Run builds, unit tests
   and CPU profiles separately from scored timing repetitions.

Repeat shorter horizontal and hidden-Branch-View cases. Investigate apparent
regressions with paired baseline/final repetitions. Validate dense layouts on a
separate generated large vault with the correct address-property configuration.

Synthetic wheel replay is a stress test: native input coalescing and trackpad
momentum differ, and overdue synthetic events can arrive in a burst. Animation-frame
intervals measure callback delivery, not compositor presentation. If automation
requires DevTools' focused-page emulation, use it for every checkpoint and report
that condition. Do not infer a Fan frame-rate gain when it is already display-bound.

## Correctness checks

The automated tests cover sustained forward/reverse retention in both orientations
and with tilt; frame coalescing without reordering logical input; stale callback
cancellation; bookmark identity and disposal; inline-edit rejection; active-card
interactivity; and cache invalidation after snapshot replacement and path changes.

In Obsidian, check stationary Fan card selection, Drawer reversal/settling, body
scroll preservation, body-first wheel boundary resistance, page-mode deltas,
bookmark navigation and keyboard focus, Branch View and Deck map navigation, and
Deck-to-Desk dragging. Inspect painting with long bodies, tilt, and bottom Fan
headers. Confirm that only the anchor body scrolls and that card-frame paint
containment and transform surface caching remain enabled.

Replay a continuous wheel sequence on the same initial card body, as well as
retargeting each event to the current anchor. Test both wheel policies and both
stack models, and travel far enough to move the initial card outside the normal
rendered window. Verify total travel and that the retained card is removed after
the idle timeout. At a long body's boundary, `[960, 16]`, `[48, 928]`, and
`[24, 952]` must all move the Deck 928 px, in either direction. Check that native
body scrolling resumes after a pause and that editor/Branch View input ends
Deck ownership.

For viewport scaling, time the same pan/read/place sequence at 1,000, 10,000 and
70,000 cards. Record checksums as well as timings, and count full-array searches.
The normal sequence should resolve the starting anchor once, then reuse known
indices until the snapshot changes.

## Card label fitting during fast scrolling

Branch signatures and backlink footers share `fitMeasuredBacklinkPrefix`. Check
the complete measured row before requesting any `+N` widths: each overflow-width
callback changes a hidden label and reads its width, forcing synchronous layout.
Even a one-label row otherwise pays for an overflow measurement on every layout
pass. An unmeasured tail must still reserve an overflow button.

The fitting tests verify that a complete row performs no overflow measurements,
that narrowing and widening a signature restores the correct visible labels,
and that truncated rows retain their longest complete prefix and exact hidden
count. For live comparison, include the user's card size, splay and fade settings
and a faster 30-card-per-second replay, in addition to the ten-card-per-second
matrix above. Drain the asynchronous editing gate before checking travel at the
end of each leg. Keep warm-up runs separate from scored repetitions.
