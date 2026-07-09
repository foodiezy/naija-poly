/** Count human (non-AI) players; AI player ids are prefixed "ai_". */
export function countHumans(ids: Iterable<string>): number {
  let n = 0;
  for (const id of ids) if (!id.startsWith("ai_")) n++;
  return n;
}
