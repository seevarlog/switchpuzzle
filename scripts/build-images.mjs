#!/usr/bin/env node
/**
 * images-src/<팩>/<그림>.(png|jpg|jpeg|webp|avif|svg)
 *   → public/puzzles/<팩>/<그림>.webp        (정사각 FULL px)
 *   → public/puzzles/<팩>/thumb/<그림>.webp  (정사각 THUMB px)
 *   → public/puzzles/manifest.json
 *
 * 팩 폴더에 pack.json 을 두면 표시 이름·순서·그림 제목을 지정할 수 있다.
 *   { "name": "풍경", "order": 1, "titles": { "01": "노을 진 산" } }
 *
 * 변경된 파일만 다시 변환한다. 환경변수로 품질을 조절한다:
 *   PUZZLE_SIZE(기본 1024) PUZZLE_THUMB(기본 256) PUZZLE_QUALITY(기본 80)
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "images-src");
const OUT = path.join(ROOT, "public", "puzzles");
const FULL = Number(process.env.PUZZLE_SIZE ?? 1024);
const THUMB = Number(process.env.PUZZLE_THUMB ?? 256);
const QUALITY = Number(process.env.PUZZLE_QUALITY ?? 80);
const IMAGE_EXT = /\.(png|jpe?g|webp|avif|svg)$/i;
const CACHE_FILE = path.join(OUT, ".build-cache.json");

function slug(name) {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function isFresh(src, out, force) {
  if (force || !existsSync(out)) return false;
  const [s, o] = await Promise.all([stat(src), stat(out)]);
  return o.mtimeMs >= s.mtimeMs;
}

async function convert(src, out, size, quality) {
  await mkdir(path.dirname(out), { recursive: true });
  const input = sharp(src, { density: src.endsWith(".svg") ? 144 : undefined });
  await input
    .rotate() // EXIF 회전 반영
    .resize(size, size, { fit: "cover", position: "centre" })
    .webp({ quality, effort: 5 })
    .toFile(out);
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`images-src/ 폴더가 없습니다: ${SRC}`);
    process.exit(1);
  }
  const optionsKey = `${FULL}/${THUMB}/${QUALITY}`;
  const cache = await readJson(CACHE_FILE, {});
  const force = cache.optionsKey !== optionsKey;

  const produced = new Set([path.join(OUT, "manifest.json"), CACHE_FILE]);
  const packs = [];
  let converted = 0;
  let totalBytes = 0;

  const packDirs = (await readdir(SRC, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith("."));

  for (const dir of packDirs) {
    const packId = slug(dir.name);
    const meta = await readJson(path.join(SRC, dir.name, "pack.json"), {});
    const files = (await readdir(path.join(SRC, dir.name)))
      .filter((f) => IMAGE_EXT.test(f) && !f.startsWith("."))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

    const images = [];
    const seen = new Set();
    for (const file of files) {
      const base = file.replace(IMAGE_EXT, "");
      const id = slug(base);
      if (!id || seen.has(id)) {
        console.warn(`  건너뜀 (id 중복/빈 이름): ${dir.name}/${file}`);
        continue;
      }
      seen.add(id);

      const src = path.join(SRC, dir.name, file);
      const fullOut = path.join(OUT, packId, `${id}.webp`);
      const thumbOut = path.join(OUT, packId, "thumb", `${id}.webp`);
      produced.add(fullOut).add(thumbOut);

      if (!(await isFresh(src, fullOut, force))) {
        await convert(src, fullOut, FULL, QUALITY);
        converted++;
      }
      if (!(await isFresh(src, thumbOut, force))) {
        await convert(src, thumbOut, THUMB, Math.min(QUALITY, 70));
      }

      const bytes = (await stat(fullOut)).size;
      totalBytes += bytes + (await stat(thumbOut)).size;
      images.push({
        id: `${packId}/${id}`,
        packId,
        title: meta.titles?.[base] ?? base,
        src: `puzzles/${packId}/${id}.webp`,
        thumb: `puzzles/${packId}/thumb/${id}.webp`,
        width: FULL,
        height: FULL,
        bytes,
      });
    }

    if (images.length > 0) {
      packs.push({ id: packId, name: meta.name ?? dir.name, order: meta.order ?? Infinity, images });
    }
  }

  packs.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    packs: packs.map(({ order: _order, ...p }) => p),
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest));
  await writeFile(CACHE_FILE, JSON.stringify({ optionsKey }));
  const removed = await removeOrphans(OUT, produced);

  const count = packs.reduce((n, p) => n + p.images.length, 0);
  const mb = (totalBytes / 1024 / 1024).toFixed(2);
  const avgKb = count ? (totalBytes / count / 1024).toFixed(0) : 0;
  console.log(
    `[images] 팩 ${packs.length}개 · 그림 ${count}장 · 변환 ${converted}장 · 삭제 ${removed}개 · 합계 ${mb}MB (장당 ${avgKb}KB, ${optionsKey})`,
  );
}

/** 원본이 사라진 산출물 정리 */
async function removeOrphans(dir, keep) {
  let removed = 0;
  if (!existsSync(dir)) return removed;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += await removeOrphans(full, keep);
      if ((await readdir(full)).length === 0) await rm(full, { recursive: true });
    } else if (!keep.has(full)) {
      await rm(full);
      removed++;
    }
  }
  return removed;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
