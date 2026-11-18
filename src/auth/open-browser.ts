import { spawn } from "node:child_process";

export async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.unref();
    // Opening the handler is enough; do not wait for the browser to exit.
    setTimeout(resolve, 200);
  });
}
