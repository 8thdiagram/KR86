export type GameEntry = { key: string; id: string; kind: string };
const originals: Record<string, string> = {
  'double-ninjas': 'double-ninjas', 'paper-paper': 'paper-paper',
  'duck-hunt': 'duck-hunt', 'art-attack': 'art-attack',
  'neptunes-voyage': 'neptunes-voyage',
};

/** One admission point for original routes and every present/future generated game. */
export function gameEntry(path: string): GameEntry | null {
  const dedicated = path.match(/^\/(double-ninjas|paper-paper|duck-hunt|art-attack|neptunes-voyage)\/?$/);
  const arcade = path.match(/^\/games\/play\/([^/]+)\/?$/);
  if (!dedicated && !arcade) return null;
  const id = (dedicated ?? arcade)![1]!;
  return { key: id, id, kind: originals[id] ?? 'arcade' };
}

type Lifecycle = { pause: () => void; resume: () => void };
/** State stays in each mounted engine. This coordinates execution, not scoring or saves. */
export class GameRuntime {
  paused = true;
  private observers = new Set<() => void>();
  private engines = new Set<Lifecycle>();
  subscribe = (fn: () => void) => { this.observers.add(fn); return () => { this.observers.delete(fn); }; };
  snapshot = () => this.paused;
  register(engine: Lifecycle) {
    this.engines.add(engine);
    if (this.paused) engine.pause();
    return () => { this.engines.delete(engine); };
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.engines.forEach(engine => engine.pause());
    this.observers.forEach(fn => fn());
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.engines.forEach(engine => engine.resume());
    this.observers.forEach(fn => fn());
  }
}
