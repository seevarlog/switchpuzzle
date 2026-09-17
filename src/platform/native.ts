import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { goBack } from "../ui/router";

/** Android 하드웨어 뒤로가기: 부모 화면으로, 홈이면 앱 종료 */
export function setupNative(): void {
  if (!Capacitor.isNativePlatform()) return;
  App.addListener("backButton", () => {
    if (!goBack()) App.exitApp();
  });
}
