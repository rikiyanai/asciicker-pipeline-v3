export function shouldCycleActiveLayerOnWheel(eventLike) {
  if (!eventLike) return false;
  if (eventLike.ctrlKey || eventLike.metaKey) return false;
  return !!eventLike.altKey;
}
