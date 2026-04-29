export function shouldCycleActiveLayerOnWheel(eventLike) {
  if (!eventLike) return false;
  if (eventLike.ctrlKey || eventLike.metaKey) return false;
  // Hosted whole-sheet intentionally requires Alt+wheel so normal two-finger
  // scrolling does not silently move the active layer during editing.
  return !!eventLike.altKey;
}
