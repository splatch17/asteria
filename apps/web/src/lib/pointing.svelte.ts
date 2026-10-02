// Sensor pointing (#45, #59): the phone's orientation drives the sky map. Sources and failure
// causes in lib/sensors.ts and ADR-0003 (docs/adr/0003-visee-capteurs-web.md). Moved out of
// App.svelte (#74) without behaviour change.
import {
  devicePointing,
  pointingToView,
  quaternionPointing,
  smooth,
  type SkyPointing,
} from "./orientation";
import {
  absoluteAlpha,
  classifyOrientationEvent,
  decide,
  newProbe,
  preflight,
  querySensorPermissions,
  recordReading,
  wrap360,
  type OrientationLike,
  type PointingFailure,
  type PointingMode,
  type ProbeState,
} from "./sensors";

type Vec = [number, number, number];

/** Generic Sensor API (Chromium), not in lib.dom. */
interface GenericOrientationSensor extends EventTarget {
  quaternion: number[] | null;
  start(): void;
  stop(): void;
}
type SensorConstructor = new (options: {
  frequency: number;
  referenceFrame: "device" | "screen";
}) => GenericOrientationSensor;

/** What the pointing needs from the map. */
export interface PointingHost {
  setView(view: SkyPointing): void;
  setPointing(on: boolean): void;
  /** Current heading of the map, degrees (kept when the relative mode starts). */
  azimuth(): number;
}

export type PointingState = "off" | "waiting" | "on" | "failed";

export class SensorPointing {
  state = $state<PointingState>("off");
  mode = $state<PointingMode>("absolute");
  error = $state<PointingFailure | null>(null);
  /** The relative mode's explanation is shown (dismissed by a tap). */
  relativeNotice = $state(false);
  readonly isBrave = "brave" in navigator;

  private smoothed: { forward: Vec; up: Vec } | null = null;
  /** Relative mode: degrees added to the sensor azimuth (NaN until the first reading). */
  private headingOffset = NaN;
  private probe: ProbeState | null = null;
  private probeTimer: ReturnType<typeof setInterval> | undefined;
  /** Which source drives the view once an absolute reading came in. */
  private lockedSource: "event" | "sensor" | null = null;
  private orientationSensor: GenericOrientationSensor | null = null;

  private readonly host: PointingHost;

  constructor(host: PointingHost) {
    this.host = host;
  }

  private screenAngle = () => screen.orientation?.angle ?? 0;

  private applyPointing(raw: { forward: Vec; up: Vec }) {
    this.smoothed = {
      forward: smooth(this.smoothed?.forward ?? null, raw.forward, 0.25),
      up: smooth(this.smoothed?.up ?? null, raw.up, 0.25),
    };
    const view: SkyPointing = pointingToView(this.smoothed.forward, this.smoothed.up);
    if (this.mode === "relative") {
      // Keep the map's current heading when the relative mode starts; the finger shifts it.
      if (Number.isNaN(this.headingOffset)) this.headingOffset = this.host.azimuth() - view.azimuth;
      view.azimuth = wrap360(view.azimuth + this.headingOffset);
    }
    this.host.setView(view);
  }

  private onOrientation(e: DeviceOrientationEvent) {
    const reading = e as unknown as OrientationLike;
    const kind = classifyOrientationEvent(reading);
    if (kind === "absolute") this.lockedSource ??= "event";
    if (this.state === "waiting" && this.probe) {
      recordReading(this.probe, kind, performance.now());
      this.evaluateProbe();
    }
    if (this.state !== "on" || this.lockedSource === "sensor" || kind === "empty") return;
    if (kind === "absolute" && this.mode === "relative") {
      // A compass woke up late: switch to the true heading.
      this.mode = "absolute";
      this.relativeNotice = false;
      this.smoothed = null;
    }
    if (this.mode === "absolute" && kind !== "absolute") return;
    const alpha = kind === "absolute" ? absoluteAlpha(reading) : kind === "tilt" ? 0 : e.alpha!;
    this.applyPointing(devicePointing(alpha, e.beta!, e.gamma!, this.screenAngle()));
  }

  // "deviceorientationabsolute" is not in lib.dom's event map: listen through a generic handler.
  private readonly onOrientationEvent = (e: Event) =>
    this.onOrientation(e as DeviceOrientationEvent);

  /** AbsoluteOrientationSensor, when the browser has it: a second chance if events are empty. */
  private startOrientationSensor(): boolean {
    const Sensor = (window as unknown as { AbsoluteOrientationSensor?: SensorConstructor })
      .AbsoluteOrientationSensor;
    const probe = this.probe;
    if (!Sensor || !probe) return false;
    try {
      const sensor = new Sensor({ frequency: 60, referenceFrame: "device" });
      sensor.addEventListener("reading", () => {
        if (!sensor.quaternion) return;
        this.lockedSource ??= "sensor";
        if (this.state === "waiting" && this.probe) {
          this.probe.sensor = "active";
          recordReading(this.probe, "absolute", performance.now());
          this.evaluateProbe();
        }
        if (this.state === "on" && this.lockedSource === "sensor")
          this.applyPointing(quaternionPointing(sensor.quaternion, this.screenAngle()));
      });
      sensor.addEventListener("error", (e) => {
        const name = (e as Event & { error?: DOMException }).error?.name ?? "Error";
        this.stopOrientationSensor();
        if (this.probe) {
          this.probe.sensor = "error";
          this.probe.sensorError = name;
          this.evaluateProbe();
        }
        if (this.state === "on" && this.lockedSource === "sensor")
          this.fail(name === "NotAllowedError" ? "denied" : "silent");
      });
      sensor.start();
      this.orientationSensor = sensor;
      return true;
    } catch (e) {
      // SecurityError (permissions policy) or ReferenceError: the events remain.
      probe.sensorError = e instanceof DOMException ? e.name : "Error";
      return false;
    }
  }

  private stopOrientationSensor() {
    this.orientationSensor?.stop();
    this.orientationSensor = null;
  }

  private readonly evaluateProbe = () => {
    if (this.state !== "waiting" || !this.probe) return;
    const decision = decide(this.probe, performance.now());
    if (decision.kind === "wait") return;
    clearInterval(this.probeTimer);
    if (decision.kind === "fail") return this.fail(decision.reason);
    this.mode = decision.mode;
    this.relativeNotice = decision.mode === "relative";
    if (decision.mode === "relative") this.lockedSource = "event";
    if (this.lockedSource === "event") this.stopOrientationSensor();
    this.probe = null;
    this.state = "on";
  };

  async toggle() {
    if (this.state === "on" || this.state === "waiting") return this.stop();
    this.error = null;
    const early = preflight({
      secure: isSecureContext,
      orientationEvents: "DeviceOrientationEvent" in window,
      absoluteSensor: "AbsoluteOrientationSensor" in window,
    });
    if (early) return this.fail(early);
    // iOS Safari asks for permission; Android browsers do not.
    const request = (
      DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    ).requestPermission;
    if (request && (await request().catch(() => "denied")) !== "granted")
      return this.fail("denied");
    this.smoothed = null;
    this.headingOffset = NaN;
    this.lockedSource = null;
    this.mode = "absolute";
    this.relativeNotice = false;
    const current = newProbe(performance.now());
    this.probe = current;
    this.state = "waiting";
    this.host.setPointing(true);
    addEventListener("deviceorientationabsolute", this.onOrientationEvent);
    addEventListener("deviceorientation", this.onOrientationEvent);
    if (this.startOrientationSensor()) current.sensor = "starting";
    this.probeTimer = setInterval(this.evaluateProbe, 250);
    const verdict = await querySensorPermissions();
    if (this.probe === current && this.state === "waiting") {
      current.permission = verdict;
      this.evaluateProbe();
    }
  }

  private fail(reason: PointingFailure) {
    this.stop();
    this.error = reason;
    this.state = "failed";
  }

  stop() {
    clearInterval(this.probeTimer);
    removeEventListener("deviceorientationabsolute", this.onOrientationEvent);
    removeEventListener("deviceorientation", this.onOrientationEvent);
    this.stopOrientationSensor();
    this.probe = null;
    this.relativeNotice = false;
    this.host.setPointing(false);
    this.state = "off";
  }

  /** Relative mode: a one-finger horizontal drag shifts the heading. */
  drag(deltaAzimuth: number) {
    if (this.state !== "on" || this.mode !== "relative" || Number.isNaN(this.headingOffset)) return;
    this.headingOffset = wrap360(this.headingOffset + deltaAzimuth);
  }
}
