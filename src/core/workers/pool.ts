/**
 * Worker pool + cancellation + progress (STUB).
 *
 * The main thread renders UI only; all decode/encode/parse/compute runs here.
 * We use Comlink to turn workers into await-able proxies rather than hand-rolling
 * postMessage protocols. Transfer ArrayBuffers, never copy them.
 *
 * TODO:
 *   - size the pool to navigator.hardwareConcurrency (capped, mid-range aware)
 *   - round-robin / least-busy dispatch
 *   - AbortSignal → worker.terminate() for a real cancel button
 *   - progress channel (Comlink.proxy callbacks) surfaced as Solid signals
 */
import * as Comlink from 'comlink';

export interface PooledTask<T> {
  run(signal: AbortSignal, onProgress?: (fraction: number) => void): Promise<T>;
}

export interface WorkerPool {
  readonly size: number;
  /** Acquire a Comlink-wrapped worker endpoint of type `T`. */
  acquire<T>(): Promise<Comlink.Remote<T>>;
  dispose(): void;
}

export function createWorkerPool(_factory: () => Worker, _size?: number): WorkerPool {
  // TODO: implement. Signature is fixed so tools can be written against it now.
  throw new Error('createWorkerPool: not implemented yet');
}
