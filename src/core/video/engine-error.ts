/**
 * Turning a failed encode into a message somebody can act on.
 *
 * ffmpeg.wasm loses the cause of a failure in two separate ways, and together
 * they reduced every failure to a bare "Trimming failed." First, its worker
 * reports any exception as `e.toString()` and rejects with that STRING, so a
 * caller checking `instanceof Error` throws the text away. Second, `exec` does
 * not reject when ffmpeg fails at all: it resolves with ffmpeg's exit code, and
 * the explanation was only ever in the log lines printed on the way out.
 *
 * Pure, so it can be tested without the engine. ./ffmpeg does the wiring.
 */

/** Enough to reach back past the stats block x264 prints after a failure. */
export const RECENT_LINES = 60;

const PROGRESS = /^\s*(frame=|size=)|\bspeed=/;
const PROBLEM =
  /error|invalid|cannot|could not|failed|not found|no such|out of memory|unable|too many|unsupported|abort/i;
/** Lines ffmpeg prints after ANY failure, and the core prints even after success. */
const GENERIC = /^(Aborted\(\)|Conversion failed!?)$/;

export function rememberLine(buffer: string[], line: string): void {
  buffer.push(line);
  if (buffer.length > RECENT_LINES) buffer.splice(0, buffer.length - RECENT_LINES);
}

export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  const text = typeof e === 'string' ? e : e == null ? '' : String(e);
  return new Error(text && text !== '[object Object]' ? text : 'the video engine failed');
}

/**
 * One line for a non-zero exit, chosen from what ffmpeg printed.
 *
 * The FIRST problem line wins, because ffmpeg states a cause once and then
 * reports every step that failed because of it: a missing filter is followed by
 * "Error reinitializing filters!", a failed frame injection, a failed decode and
 * "Conversion failed!", all of them true and none of them the reason. The
 * generic closing lines only speak for themselves when nothing else was said.
 */
export function explainExit(code: number, recentLog: readonly string[]): string {
  const problems = recentLog.map((l) => l.trim()).filter((l) => !PROGRESS.test(l) && PROBLEM.test(l));
  const line = problems.find((l) => !GENERIC.test(l)) ?? problems[0];
  return line ? `${line} (exit code ${code})` : `the video engine stopped with exit code ${code}`;
}
