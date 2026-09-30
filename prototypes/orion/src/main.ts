import * as THREE from "three";
import { figureFrag, figureVert, starFrag, starVert } from "./shaders";

// [hip, ra, dec, V, B-V, IAU name, Bayer, parallax (mas)]
type Star = [number, number, number, number, number, string | null, string | null, number | null];
interface Sky {
  center: [number, number];
  stars: Star[];
  lines: { Ori: number[][] };
  anchors: Record<string, [number, number]>;
  credits: string;
}

const INK = new THREE.Color("#f0e6d2");
const NIGHT = new THREE.Color("#101b52");
const RED = new THREE.Color("#ff2a1a");
const BLACK = new THREE.Color("#000000");
const REVEAL_SECONDS = 3.2;
const RAD = Math.PI / 180;

// Gnomonic projection, mirrored in x so east is on the left (sky seen from Earth).
function project(ra: number, dec: number, [ra0, dec0]: [number, number]): [number, number] {
  const [a, d, a0, d0] = [ra * RAD, dec * RAD, ra0 * RAD, dec0 * RAD];
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
  return [-xi, eta];
}

/** Least-squares affine map (u, v) → (x, y) from ≥ 3 anchor pairs. */
function fitAffine(pairs: { u: number; v: number; x: number; y: number }[]) {
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atx = [0, 0, 0];
  const aty = [0, 0, 0];
  for (const { u, v, x, y } of pairs) {
    const row = [u, v, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) ata[i]![j]! += row[i]! * row[j]!;
      atx[i]! += row[i]! * x;
      aty[i]! += row[i]! * y;
    }
  }
  const m = new THREE.Matrix3()
    .set(
      ...(ata.flat() as [number, number, number, number, number, number, number, number, number]),
    )
    .invert();
  const solve = (b: number[]) => new THREE.Vector3(b[0], b[1], b[2]).applyMatrix3(m);
  const cx = solve(atx);
  const cy = solve(aty);
  return (u: number, v: number): [number, number] => [
    cx.x * u + cx.y * v + cx.z,
    cy.x * u + cy.y * v + cy.z,
  ];
}

function hms(deg: number): string {
  const h = deg / 15;
  const m = (h % 1) * 60;
  const s = (m % 1) * 60;
  return `${String(Math.floor(h)).padStart(2, "0")}H ${String(Math.floor(m)).padStart(2, "0")}M ${s.toFixed(1).padStart(4, "0")}S`;
}
function dms(deg: number): string {
  const sign = deg < 0 ? "−" : "+";
  const a = Math.abs(deg);
  const m = (a % 1) * 60;
  const s = (m % 1) * 60;
  return `${sign}${String(Math.floor(a)).padStart(2, "0")}° ${String(Math.floor(m)).padStart(2, "0")}′ ${s.toFixed(0).padStart(2, "0")}″`;
}

async function main() {
  const sky: Sky = await (await fetch("./orion-sky.json")).json();
  const figureTex = await new THREE.TextureLoader().loadAsync("./orion-figure.png");
  figureTex.flipY = false;
  figureTex.colorSpace = THREE.NoColorSpace;
  figureTex.minFilter = THREE.LinearFilter;

  const canvas = document.getElementById("sky") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(NIGHT);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

  const pos = new Map(sky.stars.map((s) => [s[0], project(s[1], s[2], sky.center)]));

  const uniforms = {
    uInk: { value: INK.clone() },
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uStyle: { value: 0 },
    uDpr: { value: dpr },
    uTex: { value: figureTex },
  };

  // --- Figure: engraving quad placed by affine fit on anchor stars
  const toPlane = fitAffine(
    Object.entries(sky.anchors).map(([hip, [u, v]]) => {
      const [x, y] = pos.get(Number(hip))!;
      return { u, v, x, y };
    }),
  );
  const corners: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const figGeo = new THREE.BufferGeometry();
  figGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      corners.flatMap(([u, v]) => [...toPlane(u, v), 0]),
      3,
    ),
  );
  figGeo.setAttribute("uv", new THREE.Float32BufferAttribute(corners.flat(), 2));
  figGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const figure = new THREE.Mesh(
    figGeo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: figureVert,
      fragmentShader: figureFrag,
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  scene.add(figure);

  // --- Constellation lines
  const linePos: number[] = [];
  for (const poly of sky.lines.Ori) {
    for (let i = 0; i < poly.length - 1; i++) {
      linePos.push(...pos.get(poly[i]!)!, 0, ...pos.get(poly[i + 1]!)!, 0);
    }
  }
  const lineMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0 });
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePos, 3),
    ),
    lineMat,
  );
  scene.add(lines);

  // --- Stars
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      sky.stars.flatMap((s) => [...pos.get(s[0])!, 0]),
      3,
    ),
  );
  starGeo.setAttribute(
    "aSize",
    new THREE.Float32BufferAttribute(
      sky.stars.map((s) =>
        Math.min(40, Math.max(2.5, 3.6 * Math.sqrt(10 ** (-0.4 * (s[3] - 4.5))))),
      ),
      1,
    ),
  );
  starGeo.setAttribute(
    "aPhase",
    new THREE.Float32BufferAttribute(
      sky.stars.map((s) => (s[0] % 628) / 100),
      1,
    ),
  );
  starGeo.setAttribute(
    "aSpike",
    new THREE.Float32BufferAttribute(
      sky.stars.map((s) => (s[3] < 2.6 ? 1 : 0)),
      1,
    ),
  );
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: starVert,
        fragmentShader: starFrag,
        transparent: true,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );

  // --- Camera framing on Orion
  const frame = [
    [0.1, 0.12],
    [0.9, 0.12],
    [0.9, 0.95],
    [0.1, 0.95],
  ].map(([u, v]) => toPlane(u!, v!));
  const xs = frame.map(([x]) => x);
  const ys = frame.map(([, y]) => y);
  const bx = [Math.min(...xs), Math.max(...xs)];
  const by = [Math.min(...ys), Math.max(...ys)];

  const labelsEl = document.getElementById("labels")!;
  const labelled = sky.stars.filter((s) => s[5] && s[3] < 2.3);
  const labelEls = labelled.map((s) => {
    const el = document.createElement("span");
    el.className = "label";
    el.textContent = s[5]!;
    labelsEl.append(el);
    return el;
  });

  function toScreen(x: number, y: number): [number, number] {
    const v = new THREE.Vector3(x, y, 0).project(camera);
    return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    const aspect = innerWidth / innerHeight;
    const midX = (bx[0]! + bx[1]!) / 2;
    const midY = (by[0]! + by[1]!) / 2;
    let halfW = ((bx[1]! - bx[0]!) / 2) * 1.08;
    let halfH = ((by[1]! - by[0]!) / 2) * 1.12;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    camera.left = midX - halfW;
    camera.right = midX + halfW;
    // leave room for the title (top) and controls (bottom)
    camera.top = midY + halfH * 1.18;
    camera.bottom = midY - halfH * 1.12;
    camera.updateProjectionMatrix();
    labelled.forEach((s, i) => {
      const [sx, sy] = toScreen(...pos.get(s[0])!);
      labelEls[i]!.style.left = `${sx}px`;
      labelEls[i]!.style.top = `${sy}px`;
    });
  }
  addEventListener("resize", resize);
  resize();

  // --- UI
  let start = performance.now();
  const styleButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-style]")];
  for (const b of styleButtons) {
    b.addEventListener("click", () => {
      uniforms.uStyle.value = Number(b.dataset.style);
      styleButtons.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      start = performance.now();
    });
  }
  document.getElementById("replay")!.addEventListener("click", () => (start = performance.now()));
  const nightBtn = document.getElementById("night")!;
  nightBtn.addEventListener("click", () => {
    const on = document.documentElement.dataset.night !== "red";
    document.documentElement.dataset.night = on ? "red" : "";
    nightBtn.setAttribute("aria-pressed", String(on));
    uniforms.uInk.value.copy(on ? RED : INK);
    lineMat.color.copy(on ? RED : INK);
    renderer.setClearColor(on ? BLACK : NIGHT);
  });
  document.getElementById("credits")!.textContent = sky.credits;

  // Deep links for review/screenshots: ?style=0|1|2&night=1&still=1
  const params = new URLSearchParams(location.search);
  styleButtons[Number(params.get("style") ?? 0)]?.click();
  if (params.get("night") === "1") nightBtn.click();
  const still = params.get("still") === "1";

  // Tap a star → data panel typed out character by character
  const panel = document.getElementById("panel")!;
  let typing = 0;
  canvas.addEventListener("pointerdown", (e) => {
    let best: Star | undefined;
    let bestD = 28;
    for (const s of sky.stars) {
      const [sx, sy] = toScreen(...pos.get(s[0])!);
      const d = Math.hypot(sx - e.clientX, sy - e.clientY) - (5 - s[3]) * 2;
      if (d < bestD) [best, bestD] = [s, d];
    }
    if (!best) {
      panel.hidden = true;
      return;
    }
    const [hip, ra, dec, v, bv, name, bayer, plx] = best;
    // 1 pc = 3.26156 ly; parallax in milliarcseconds
    const dist = plx && plx > 0 ? `${Math.round((1000 / plx) * 3.26156)} AL` : "—";
    document.getElementById("panel-id")!.textContent = `HIP ${hip}${bayer ? ` // ${bayer}` : ""}`;
    document.getElementById("panel-name")!.textContent = name ?? bayer ?? `HIP ${hip}`;
    const text = [
      `RA   ${hms(ra)}`,
      `DEC  ${dms(dec)}`,
      `V    ${v.toFixed(2)}`,
      `B−V  ${bv.toFixed(2)}`,
      `DIST ${dist}`,
    ].join("\n");
    const out = document.getElementById("panel-data")!;
    panel.hidden = false;
    const id = ++typing;
    let i = 0;
    const tick = () => {
      if (id !== typing) return;
      out.textContent = text.slice(0, ++i) + (i < text.length ? "▌" : "");
      if (i < text.length) setTimeout(tick, 12);
    };
    tick();
  });

  // --- Loop
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  renderer.setAnimationLoop((now) => {
    const t = still ? 1 : Math.min(1, (now - start) / 1000 / REVEAL_SECONDS);
    uniforms.uTime.value = now / 1000;
    uniforms.uProgress.value = ease(t);
    lineMat.opacity = 0.8 * ease(Math.max(0, (t - 0.45) / 0.55));
    labelEls.forEach((el) => el.classList.toggle("on", t > 0.8));
    renderer.render(scene, camera);
  });
}

main();
