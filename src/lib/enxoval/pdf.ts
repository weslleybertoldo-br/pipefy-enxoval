import { buildHtml } from "./pdf-template";
import type { EnxovalSnapshot } from "./derive";

/**
 * Gera o PDF do enxoval. Em ambientes serverless (Vercel) usa
 * @sparticuz/chromium-min + puppeteer-core; em dev (local) usa o
 * puppeteer normal já com Chromium baixado.
 */
export async function gerarEnxovalPdf(snapshot: EnxovalSnapshot): Promise<Buffer> {
  const html = buildHtml(snapshot);
  const isServerless =
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME != null ||
    process.env.AWS_EXECUTION_ENV != null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;
  if (isServerless) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chromiumMin: any = (await import("@sparticuz/chromium-min")).default;
    const puppeteerCore = await import("puppeteer-core");
    const remotePack =
      process.env.CHROMIUM_PACK_URL ||
      "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar";
    browser = await puppeteerCore.launch({
      args: chromiumMin.args,
      defaultViewport: chromiumMin.defaultViewport,
      executablePath: await chromiumMin.executablePath(remotePack),
      headless: chromiumMin.headless,
    });
  } else {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdfData);
  } finally {
    await browser.close().catch(() => {});
  }
}
