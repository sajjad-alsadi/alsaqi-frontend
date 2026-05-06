import path from "path";
import crypto from "crypto";
import fs from "fs";

import logger from "./logger";
import { ValidationError } from "./errors";

// Try to load magika dynamically to avoid breaking if not installed properly
let magikaInstance: any = null;
let magikaPromise: Promise<void> | null = null;

async function getMagika() {
  if (magikaInstance) return magikaInstance;
  if (!magikaPromise) {
    magikaPromise = (async () => {
      try {
        const { Magika } = await import('magika');
        const m = await Magika.create();
        magikaInstance = m;
        logger.info("[SETUP] Magika file identification loaded securely.");
      } catch (e) {
        logger.warn("[SETUP] Magika not available. Falling back to simple extension checks.", e);
      }
    })();
  }
  await magikaPromise;
  return magikaInstance;
}

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'];

// General mapping from ext to magika labels (optional loose check)
const EXT_TO_MAGIKA_LABEL: Record<string, string[]> = {
  '.jpg': ['jpeg', 'jpg'],
  '.jpeg': ['jpeg', 'jpg'],
  '.png': ['png'],
  '.gif': ['gif'],
  '.webp': ['webp'],
  '.pdf': ['pdf'],
  '.doc': ['doc', 'msword', 'unknown', 'rtf'],      // Sometimes older docs are identified as unknown or msword
  '.docx': ['docx', 'zip', 'unknown'],              // docx is fundamentally a zip
  '.xls': ['xls', 'unknown'],
  '.xlsx': ['xlsx', 'zip', 'unknown'],              // xlsx is fundamentally a zip
  '.txt': ['txt', 'txt', 'csv', 'unknown', 'empty'],
  '.csv': ['csv', 'txt', 'unknown', 'empty']
};

export const MIME_TO_EXT: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv']
};

export const createSaveFile = (uploadDir: string) => async (file: any): Promise<string> => {
  const rawExt = path.extname(file.name).toLowerCase();
  
  // Security Check 1: Ensure extension is allowed
  if (!ALLOWED_EXTENSIONS.includes(rawExt)) {
    throw new ValidationError(`Extension ${rawExt} is not allowed`);
  }

  // Security Check 2: Cross-verify mimetype with extension
  const expectedExts = MIME_TO_EXT[file.mimetype];
  if (!expectedExts || !expectedExts.includes(rawExt)) {
    throw new ValidationError(`Mime-type mismatch for extension ${rawExt}`);
  }

  // Security Check 3: Deep inspection with Magika (if available)
  const magika = await getMagika();
  if (magika && file.data) {
    try {
      const res = await magika.identifyBytes(file.data);
      const label = res?.prediction?.output?.label;
      const allowedLabels = EXT_TO_MAGIKA_LABEL[rawExt] || [];
      
      // If it's heavily confident but totally mismatched, we log/reject
      if (label && !allowedLabels.includes(label)) {
        logger.warn(`Magika labels mismatch. File ext: ${rawExt}, Magika: ${label}`);
        // We'll be lenient with "txt" vs "csv" vs "unknown" just to be safe in dev,
        // but for tight security we can reject. Let's reject obvious mismatches.
        if (label === 'elf' || label === 'pebin' || label === 'macho' || label === 'javascript' || label === 'php' || label === 'html') {
          throw new ValidationError(`File content does not match extension (detected: ${label})`);
        }
      }
    } catch (e: any) {
      if (e instanceof ValidationError) throw e;
      logger.warn(`Magika check failed for file: ${file.name}`, e);
    }
  }

  const baseName = path.basename(file.name, rawExt).replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${baseName}${rawExt}`;
  const uploadPath = path.join(uploadDir, fileName);
  
  await file.mv(uploadPath);
  return `/uploads/${fileName}`;
};

export const createLogError = (db: any) => async (err: any, module: string = "Backend") => {
  let errorMessage = "";
  let errorStack = null;

  if (err instanceof Error) {
    errorMessage = err.message;
    errorStack = err.stack || null;
  } else if (typeof err === 'object' && err !== null) {
    try {
      errorMessage = JSON.stringify(err);
    } catch (e) {
      errorMessage = String(err);
    }
  } else {
    errorMessage = String(err);
  }
  
  logger.error(`[${module}] ${errorMessage}`, { stack: errorStack, module });
  
  try {
    // Ensure we don't crash if DB is in a bad state or stack is too large for database
    const stmt = await db.prepare("INSERT INTO system_error_log (message, stack, module) VALUES (?::text, ?::text, ?::text)");
    const truncatedStack = errorStack ? errorStack.substring(0, 2000) : null;
    await stmt.run(errorMessage, truncatedStack, module);
  } catch (e) {
    logger.error("CRITICAL: Failed to log error to DB.", { error: e });
  }
};
