import "server-only";
import QRCode from "qrcode";

const OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#202A24", light: "#FFFFFF" } };

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: "svg" });
}

export function qrPng(url: string, width = 1200): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPTIONS, type: "png", width });
}
