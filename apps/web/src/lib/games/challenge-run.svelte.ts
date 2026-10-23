/**
 * A challenge being played (#187), shared by the three game screens: the score (challenge.ts)
 * and, for « Contre-la-montre », the countdown, paused while the page is hidden. The digits are
 * updated 5 times a second (`remaining`); the bar under the game's head is a CSS animation
 * (compositor only), restarted from the right point on each (re)start (`segment`).
 */
import {
  Countdown,
  TIMED_MS,
  answerChallenge,
  challengeScore,
  endChallenge,
  startChallenge,
  type ChallengeEnd,
  type ChallengeMode,
  type ChallengeState,
} from "./challenge";

const TICK_MS = 200;

export class ChallengeRun {
  readonly mode: ChallengeMode;
  state = $state.raw<ChallengeState>(startChallenge("streak"));
  /** Time left (ms), timed mode. */
  remaining = $state(TIMED_MS);
  running = $state(false);
  /** Bumped on each (re)start of the clock: keys the bar's animation. */
  segment = $state(0);
  /** Time left when the clock last (re)started: where the bar's animation starts from. */
  left = $state(TIMED_MS);
  readonly #countdown = new Countdown(TIMED_MS);
  #timer: ReturnType<typeof setInterval> | null = null;
  readonly #onTime: () => void;
  readonly #onVisibility = () => {
    if (document.hidden) this.#pause();
    else if (!this.state.end && this.#started) this.#resume();
  };
  #started = false;

  /** `onTime`: the timed challenge ran out (the game shows its end). */
  constructor(mode: ChallengeMode, onTime: () => void) {
    this.mode = mode;
    this.state = startChallenge(mode);
    this.#onTime = onTime;
  }

  get timed(): boolean {
    return this.mode === "timed";
  }

  get over(): boolean {
    return this.state.end !== null;
  }

  /** Starts the clock (timed), once the first question is on screen. */
  start(): void {
    if (!this.timed || this.#started) return;
    this.#started = true;
    document.addEventListener("visibilitychange", this.#onVisibility);
    if (!document.hidden) this.#resume();
  }

  /** Records an answer; true when it ended the challenge (a streak's mistake). */
  answer(correct: boolean, points = 0): boolean {
    if (this.state.end) return true;
    this.state = answerChallenge(this.state, correct, points);
    return this.state.end !== null;
  }

  end(why: ChallengeEnd): void {
    this.state = endChallenge(this.state, why);
    this.stop();
  }

  score(inPoints: boolean): number {
    return challengeScore(this.state, inPoints);
  }

  /** What the game's head shows (GameHeader's `challenge`), `best` the record to beat. */
  head(best: number) {
    return {
      mode: this.mode,
      value: this.state.right,
      best,
      remaining: this.remaining,
      running: this.running,
      segment: this.segment,
      left: this.left,
    };
  }

  /** Stops the clock for good (end of the challenge, game left). */
  stop(): void {
    this.#pause();
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    document.removeEventListener("visibilitychange", this.#onVisibility);
  }

  #resume() {
    if (this.running) return;
    const now = performance.now();
    this.left = this.#countdown.remaining(now);
    this.#countdown.start(now);
    this.running = true;
    this.segment++;
    this.#timer ??= setInterval(() => this.#tick(), TICK_MS);
  }

  #pause() {
    if (!this.running) return;
    this.#countdown.pause(performance.now());
    this.remaining = this.#countdown.remaining(performance.now());
    this.running = false;
  }

  #tick() {
    if (!this.running) return;
    const now = performance.now();
    this.remaining = this.#countdown.remaining(now);
    if (this.#countdown.expired(now)) {
      this.end("time");
      this.#onTime();
    }
  }
}
