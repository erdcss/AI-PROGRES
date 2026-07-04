import { execFileSync } from "child_process";
import os from "os";

let curlHttp2Supported: boolean | null = null;

function resolveCurlExecutable(): string {
  if (process.platform === "win32") {
    return process.env.CURL_EXECUTABLE?.trim() || "curl.exe";
  }
  return process.env.CURL_EXECUTABLE?.trim() || "curl";
}

export function curlSupportsHttp2(): boolean {
  if (curlHttp2Supported !== null) return curlHttp2Supported;
  try {
    const out = execFileSync(resolveCurlExecutable(), ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    curlHttp2Supported = /HTTP2|http2/i.test(out);
  } catch {
    curlHttp2Supported = false;
  }
  return curlHttp2Supported;
}

export function fetchUrlWithCurl(url: string, timeoutSec = 12): string | null {
  const curl = resolveCurlExecutable();
  const args = [
    "-s",
    "--max-time",
    String(timeoutSec),
    "--compressed",
    "-H",
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "-H",
    "Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "-H",
    "Cache-Control: no-cache",
    "-H",
    "Referer: https://www.google.com/",
    "-L",
    url,
  ];
  if (curlSupportsHttp2()) {
    args.splice(2, 0, "--http2");
  }
  try {
    const output = execFileSync(curl, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: (timeoutSec + 2) * 1000,
      windowsHide: true,
    });
    return output && output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

export function getDefaultBrowserPlatform(): string {
  if (process.platform === "win32") return "Win32";
  if (process.platform === "darwin") return "MacIntel";
  return "Linux x86_64";
}
