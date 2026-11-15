/** Recover the existing effects, rather than creating substitute sounds.
 * Safari can report "interrupted" after an app switch, not just "suspended".
 * Keep the resume call synchronous with the user's gesture. */
const waking = new WeakMap<AudioContext, { promise: Promise<void>; started: number }>();
const clock = () => typeof performance === 'undefined' ? Date.now() : performance.now();
const visible = () => typeof document === 'undefined' || !document.hidden;

export function resumeGameAudio(context: AudioContext): Promise<void> {
  if (context.state === 'running') return Promise.resolve();
  if (context.state === 'closed') return Promise.reject(new Error('The game audio context has closed.'));
  const pending = waking.get(context);
  if (pending && clock() - pending.started <= 150) return pending.promise;
  try {
    const promise = context.resume().then(() => {
      if (context.state !== 'running') throw new Error('Game audio still needs user activation.');
    });
    const entry = { promise, started: clock() };
    waking.set(context, entry);
    void promise.finally(() => { if (waking.get(context) === entry) waking.delete(context); }).catch(() => undefined);
    return promise;
  } catch (error) { return Promise.reject(error); }
}

/** An effect on the same gesture as resume must not be thrown away. Never
 * accumulate background effects or replay old kicks/impacts after returning. */
export function playActivatedGameAudio(context: AudioContext | undefined, play: () => boolean | void): boolean {
  if (!context || !visible()) return false;
  if (context.state === 'running') return play() !== false;
  const pending = waking.get(context);
  if (!pending || clock() - pending.started > 150) return false;
  void pending.promise.then(() => {
    if (visible() && context.state === 'running' && clock() - pending.started <= 150) play();
  }).catch(() => undefined);
  return true;
}
