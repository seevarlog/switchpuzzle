import { defineConfig } from "vite";

export default defineConfig({
  // 상대 경로: Capacitor WebView·GitHub Pages 하위 경로 모두에서 동작
  base: "./",
  build: {
    // 업데이트가 늦은 Android System WebView 까지 고려
    target: ["es2020", "chrome87"],
    // 그림은 public/puzzles 로 복사되므로 인라인 대상 아님
    assetsInlineLimit: 0,
  },
});
