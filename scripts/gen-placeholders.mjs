#!/usr/bin/env node
/**
 * 프로토타입용 샘플 그림(SVG) 생성기. 실제 그림이 들어오면 images-src/ 에서 지우면 된다.
 * 시드 고정이라 몇 번을 돌려도 같은 그림이 나온다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "images-src");
const S = 1024;
const PER_PACK = 8;

function rngFrom(seed) {
  // 연속 시드의 첫 출력이 닮지 않도록 해시로 섞는다 (src/core/rng.ts 와 동일)
  let a = seed >>> 0;
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  a = (a ^ (a >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng, min, max) => min + rng() * (max - min);
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;

function ridge(rng, baseY, amp, step) {
  const pts = [`0,${S}`];
  for (let x = 0; x <= S + step; x += step) {
    pts.push(`${Math.min(x, S)},${(baseY - rng() * amp).toFixed(0)}`);
  }
  pts.push(`${S},${S}`);
  return pts.join(" ");
}

function landscape(seed) {
  const rng = rngFrom(seed);
  const hue = between(rng, 0, 360);
  const sunX = between(rng, 180, 840);
  const sunY = between(rng, 170, 360);
  const parts = [
    `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hsl(hue, 65, 45)}"/>
        <stop offset="0.6" stop-color="${hsl(hue + 35, 80, 75)}"/>
        <stop offset="1" stop-color="${hsl(hue + 60, 90, 88)}"/>
      </linearGradient>
      <radialGradient id="glow">
        <stop offset="0" stop-color="${hsl(45, 100, 85, 0.9)}"/>
        <stop offset="1" stop-color="${hsl(45, 100, 85, 0)}"/>
      </radialGradient>
    </defs>`,
    `<rect width="${S}" height="${S}" fill="url(#sky)"/>`,
    `<circle cx="${sunX}" cy="${sunY}" r="260" fill="url(#glow)"/>`,
    `<circle cx="${sunX}" cy="${sunY}" r="${between(rng, 60, 110)}" fill="${hsl(40 + rng() * 20, 100, 72)}"/>`,
  ];
  for (let c = 0; c < 4; c++) {
    const cx = between(rng, 60, 960);
    const cy = between(rng, 90, 420);
    const w = between(rng, 60, 130);
    parts.push(
      `<g fill="${hsl(0, 0, 100, 0.8)}">` +
        `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${w * 0.35}"/>` +
        `<ellipse cx="${cx + w * 0.5}" cy="${cy - w * 0.2}" rx="${w * 0.6}" ry="${w * 0.35}"/>` +
        `</g>`,
    );
  }
  const layers = [
    { y: 560, amp: 260, step: 90, l: 58 },
    { y: 690, amp: 200, step: 70, l: 42 },
    { y: 820, amp: 150, step: 55, l: 28 },
  ];
  for (const [i, layer] of layers.entries()) {
    parts.push(`<polygon points="${ridge(rng, layer.y, layer.amp, layer.step)}" fill="${hsl(hue + 150 + i * 12, 35, layer.l)}"/>`);
  }
  parts.push(`<rect y="900" width="${S}" height="124" fill="${hsl(hue + 190, 45, 18)}"/>`);
  for (let t = 0; t < 14; t++) {
    const x = between(rng, 0, S);
    const h = between(rng, 60, 150);
    const base = between(rng, 900, 1000);
    parts.push(`<polygon points="${x},${base - h} ${x - h * 0.28},${base} ${x + h * 0.28},${base}" fill="${hsl(hue + 170, 40, 12 + rng() * 8)}"/>`);
  }
  return svg(parts);
}

function shapes(seed) {
  const rng = rngFrom(seed);
  const hue = between(rng, 0, 360);
  const palette = [0, 40, 150, 200, 280].map((d) => hsl(hue + d, 75, 58));
  const pick = () => palette[Math.floor(rng() * palette.length)];
  const parts = [
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hsl(hue, 45, 18)}"/>
      <stop offset="1" stop-color="${hsl(hue + 70, 55, 32)}"/>
    </linearGradient></defs>`,
    `<rect width="${S}" height="${S}" fill="url(#bg)"/>`,
  ];
  for (let i = 0; i < 16; i++) {
    parts.push(`<rect x="0" y="${i * 64}" width="${S}" height="2" fill="${hsl(0, 0, 100, 0.05)}"/>`);
  }
  for (let r = 0; r < 3; r++) {
    const cx = between(rng, 150, 870);
    const cy = between(rng, 150, 870);
    for (let k = 6; k > 0; k--) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${k * 38}" fill="none" stroke="${pick()}" stroke-width="10" opacity="0.55"/>`);
    }
  }
  for (let i = 0; i < 22; i++) {
    const x = between(rng, 0, S);
    const y = between(rng, 0, S);
    const size = between(rng, 40, 170);
    const rot = between(rng, 0, 360);
    const fill = pick();
    const kind = Math.floor(rng() * 3);
    const shape =
      kind === 0
        ? `<circle r="${size / 2}"/>`
        : kind === 1
          ? `<rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${size * 0.15}"/>`
          : `<polygon points="0,${-size / 2} ${size / 2},${size / 2} ${-size / 2},${size / 2}"/>`;
    parts.push(`<g transform="translate(${x} ${y}) rotate(${rot})" fill="${fill}" opacity="${between(rng, 0.65, 0.95)}">${shape}</g>`);
  }
  return svg(parts);
}

function svg(parts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${parts.join("")}</svg>\n`;
}

const PACKS = [
  { dir: "landscape", name: "풍경", order: 1, make: landscape, seed: 1000 },
  { dir: "shapes", name: "도형", order: 2, make: shapes, seed: 2000 },
];

for (const pack of PACKS) {
  const dir = path.join(SRC, pack.dir);
  await mkdir(dir, { recursive: true });
  const titles = {};
  for (let i = 1; i <= PER_PACK; i++) {
    const name = String(i).padStart(2, "0");
    titles[name] = `${pack.name} ${i}`;
    await writeFile(path.join(dir, `${name}.svg`), pack.make(pack.seed + i));
  }
  await writeFile(path.join(dir, "pack.json"), `${JSON.stringify({ name: pack.name, order: pack.order, titles }, null, 2)}\n`);
}
console.log(`[sample] ${PACKS.length}개 팩 × ${PER_PACK}장 생성 → images-src/`);
