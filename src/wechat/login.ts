import type { AccountData } from "./types.js";
import { logger } from "../logger.js";
import { fetchWithRetry } from "./fetch-helper.js";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const QR_CODE_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
const QR_STATUS_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status`;
const POLL_INTERVAL_MS = 3_000;

interface QrCodeResponse {
  ret: number;
  qrcode?: string;
  qrcode_img_content?: string;
}

interface QrStatusResponse {
  ret: number;
  status: string;
  retmsg?: string;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function displayQrInTerminal(qrcodeUrl: string): Promise<void> {
  try {
    const qrcodeTerminal = await import("qrcode-terminal");
    qrcodeTerminal.default.generate(qrcodeUrl, { small: true });
    console.log("如果二维码未能成功展示，请用浏览器打开以下链接扫码：");
    console.log(qrcodeUrl);
    console.log();
  } catch (err) {
    logger.warn("qrcode-terminal not available", { error: String(err) });
    console.log("无法在终端显示二维码，请用浏览器打开以下链接扫码：");
    console.log(qrcodeUrl);
    console.log();
  }
}

export async function startQrLogin(): Promise<{
  qrcodeUrl: string;
  qrcodeId: string;
}> {
  logger.info("Requesting QR code");
  
  try {
    const res = await fetchWithRetry(QR_CODE_URL, {
      method: "GET",
      timeout: 30000,
      retries: 3,
      retryDelay: 2000,
    });

    if (!res.ok) {
      throw new Error(`Failed to get QR code: HTTP ${res.status}`);
    }

    const data = (await res.json()) as QrCodeResponse;
    if (data.ret !== 0 || !data.qrcode_img_content || !data.qrcode) {
      throw new Error(`Failed to get QR code (ret=${data.ret})`);
    }

    logger.info("QR code obtained", { qrcodeId: data.qrcode });
    return {
      qrcodeUrl: data.qrcode_img_content,
      qrcodeId: data.qrcode,
    };
  } catch (err) {
    logger.error("Failed to request QR code", { error: String(err) });
    throw err;
  }
}

export async function waitForQrScan(qrcodeId: string): Promise<AccountData> {
  let currentQrcodeId = qrcodeId;

  while (true) {
    const url = `${QR_STATUS_URL}?qrcode=${encodeURIComponent(currentQrcodeId)}`;
    logger.debug("Polling QR status", { qrcodeId: currentQrcodeId });

    try {
      const res = await fetchWithRetry(url, {
        method: "GET",
        timeout: 60000,
        retries: 2,
        retryDelay: 3000,
      });

      if (!res.ok) {
        throw new Error(`Failed to check QR status: HTTP ${res.status}`);
      }

      const data = (await res.json()) as QrStatusResponse;
      logger.debug("QR status response", { status: data.status });

      switch (data.status) {
        case "wait":
        case "scaned":
          break;

        case "confirmed": {
          if (!data.bot_token || !data.ilink_bot_id || !data.ilink_user_id) {
            throw new Error(
              "QR confirmed but missing required fields in response"
            );
          }

          const accountData: AccountData = {
            botToken: data.bot_token,
            accountId: data.ilink_bot_id,
            baseUrl: data.baseurl || DEFAULT_BASE_URL,
            userId: data.ilink_user_id,
            createdAt: new Date().toISOString(),
          };

          logger.info("QR login successful", {
            accountId: accountData.accountId,
          });
          return accountData;
        }

        case "expired": {
          logger.info("QR code expired");
          throw new Error("QR code expired");
        }

        default:
          logger.warn("Unknown QR status", {
            status: data.status,
            retmsg: data.retmsg,
          });

          const status = data.status ?? "";
          if (
            status &&
            (status.includes("not_support") ||
              status.includes("version") ||
              status.includes("forbid") ||
              status.includes("reject") ||
              status.includes("cancel"))
          ) {
            throw new Error(`二维码扫描失败: ${data.retmsg || status}`);
          }

          if (data.retmsg) {
            throw new Error(`二维码扫描失败: ${data.retmsg}`);
          }
          break;
      }

      await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("expired") || err.message.includes("失败"))
      ) {
        throw err;
      }
      logger.warn("Error polling QR status, will retry", {
        error: String(err),
      });
      await sleep(POLL_INTERVAL_MS);
    }
  }
}
