#!/usr/bin/env node
/**
 * 서버 없이 열리는 한 파일 배포본을 만든다. (원격 공유·메신저 전달·Artifact 게시용)
 *   dist-standalone/switchpuzzle.html   완전한 HTML 문서 — 파일로 받아 브라우저에서 바로 열기
 *   dist-standalone/artifact.html       <html>/<head> 없는 본문 조각 — claude.ai Artifact 게시용
 *
 * JS·CSS 를 인라인하고, 그림은 data URI 로 manifest 에 담아 window.__PUZZLE_MANIFEST__ 로 심는다.
 * 그림이 많아지면 파일이 커지므로 샘플/데모 공유 용도로만 쓴다. 실행 전 npm run images 필요.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist-standalone");
const VITE_OUT = path.join(OUT, "_vite");
const PUBLIC = path.join(ROOT, "public");
const TITLE = "스위치 퍼즐";
const MAX_BYTES = 16 * 1024 * 1024; // Artifact 페이지 한도

async function main() {
  const manifestPath = path.join(PUBLIC, "puzzles", "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("public/puzzles/manifest.json 이 없습니다 — npm run images 를 먼저 실행하세요");

  await build({
    root: ROOT,
    logLevel: "warn",
    build: {
      outDir: VITE_OUT,
      emptyOutDir: true,
      copyPublicDir: false, // 그림은 아래에서 data URI 로 직접 넣는다
      modulePreload: false,
      rolldownOptions: { output: { codeSplitting: false } }, // 동적 import 까지 한 파일로
    },
  });

  const assets = await readdir(path.join(VITE_OUT, "assets"));
  const jsFiles = assets.filter((f) => f.endsWith(".js"));
  const cssFiles = assets.filter((f) => f.endsWith(".css"));
  if (jsFiles.length !== 1) throw new Error(`JS 가 한 파일이 아닙니다: ${jsFiles.join(", ")}`);
  const js = await readFile(path.join(VITE_OUT, "assets", jsFiles[0]), "utf8");
  const css = (await Promise.all(cssFiles.map((f) => readFile(path.join(VITE_OUT, "assets", f), "utf8")))).join("\n");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const pack of manifest.packs) {
    for (const img of pack.images) {
      img.src = await toDataUri(img.src);
      img.thumb = await toDataUri(img.thumb);
    }
  }

  // </script> 로 문서가 끊기지 않게 이스케이프
  const manifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");
  const safeJs = js.replace(/<\/script/gi, "<\\/script");

  const body = [
    `<div id="app"></div>`,
    `<script>window.__PUZZLE_MANIFEST__=${manifestJson};</script>`,
    `<script type="module">${safeJs}</script>`,
  ].join("\n");

  const fullDoc = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#14161c" />
<title>${TITLE}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;

  // Artifact 게시 틀이 <head>·안전 영역 여백(:root padding)을 제공하므로 화면 자체 여백은 뺀다
  const fragment = `<title>${TITLE}</title>
<style>${css}</style>
<style>.screen{padding-top:0;padding-bottom:0}</style>
${body}
`;

  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "switchpuzzle.html"), fullDoc);
  await writeFile(path.join(OUT, "artifact.html"), fragment);
  await rm(VITE_OUT, { recursive: true });

  const size = Buffer.byteLength(fullDoc);
  const count = manifest.packs.reduce((n, p) => n + p.images.length, 0);
  console.log(`[standalone] 그림 ${count}장 · ${(size / 1024 / 1024).toFixed(2)}MB → dist-standalone/switchpuzzle.html, artifact.html`);
  if (size > MAX_BYTES) console.warn(`[standalone] 16MB 초과 — Artifact 로는 게시할 수 없습니다`);
}

async function toDataUri(relPath) {
  const buf = await readFile(path.join(PUBLIC, relPath));
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
