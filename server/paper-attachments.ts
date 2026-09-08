import type { RequestHandler, Response } from "express";
import multer from "multer";
import path from "path";
import sharp from "sharp";
import type { StoredPaperAttachmentInput } from "./storage";

export const MAX_PAPER_ATTACHMENTS = 5;
export const MAX_PAPER_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PAPER_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024;

const PAPER_ATTACHMENT_TYPES: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf", "application/octet-stream"],
  ".doc": ["application/msword", "application/octet-stream", "application/x-ole-storage"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream",
  ],
  ".hwp": [
    "application/x-hwp",
    "application/haansofthwp",
    "application/vnd.hancom.hwp",
    "application/octet-stream",
    "application/x-ole-storage",
  ],
  ".hwpx": [
    "application/vnd.hancom.hwpx",
    "application/x-hwpx",
    "application/zip",
    "application/octet-stream",
  ],
  ".ppt": ["application/vnd.ms-powerpoint", "application/octet-stream", "application/x-ole-storage"],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/octet-stream",
  ],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
};

const NORMALIZED_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/vnd.hancom.hwpx",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const storage = multer.memoryStorage();

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
) {
  const extension = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();
  if (!PAPER_ATTACHMENT_TYPES[extension]?.includes(mimeType)) {
    callback(new Error("PAPER_ATTACHMENT_REJECTED"));
    return;
  }
  callback(null, true);
}

const attachmentArrayUpload = multer({
  storage,
  limits: {
    fileSize: MAX_PAPER_ATTACHMENT_BYTES,
    files: MAX_PAPER_ATTACHMENTS,
    fields: 2,
    fieldSize: 64 * 1024,
    parts: MAX_PAPER_ATTACHMENTS + 3,
  },
  fileFilter,
});

const attachmentSingleUpload = multer({
  storage,
  limits: {
    fileSize: MAX_PAPER_ATTACHMENT_BYTES,
    files: 1,
    fields: 1,
    fieldSize: 8 * 1024,
    parts: 3,
  },
  fileFilter,
});

function uploadErrorResponse(error: unknown, response: Response) {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "첨부파일 한 개의 최대 크기는 10MB입니다"
      : error.code === "LIMIT_FILE_COUNT"
        ? "논문 한 건에는 최대 5개의 파일을 첨부할 수 있습니다"
        : "첨부파일 업로드 제한을 확인해주세요";
    response.status(400).json({ error: message, code: "PAPER_ATTACHMENT_REJECTED" });
    return;
  }
  response.status(400).json({
    error: "PDF, Word, HWP, PowerPoint 또는 JPG, PNG, WebP 파일만 첨부할 수 있습니다",
    code: "PAPER_ATTACHMENT_REJECTED",
  });
}

export const paperAttachmentArrayUpload: RequestHandler = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();
  attachmentArrayUpload.array("attachments", MAX_PAPER_ATTACHMENTS)(req, res, error => {
    if (error) return uploadErrorResponse(error, res);
    next();
  });
};

export const paperAttachmentSingleUpload: RequestHandler = (req, res, next) => {
  attachmentSingleUpload.single("attachment")(req, res, error => {
    if (error) return uploadErrorResponse(error, res);
    next();
  });
};

function isZip(bytes: Buffer): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(bytes[2])
    && [0x04, 0x06, 0x08].includes(bytes[3]);
}

function isOle(bytes: Buffer): boolean {
  return bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

function containsOleStreamName(bytes: Buffer, name: string): boolean {
  return bytes.includes(Buffer.from(name, "utf16le"));
}

function containsContainerMarker(bytes: Buffer, marker: string): boolean {
  return bytes.includes(Buffer.from(marker, "utf8"));
}

async function hasValidContent(file: Express.Multer.File): Promise<boolean> {
  const extension = path.extname(file.originalname).toLowerCase();
  const bytes = file.buffer;
  if (!bytes.length || file.size !== bytes.length) return false;

  if (extension === ".pdf") {
    const eofSearchStart = Math.max(0, bytes.length - 4_096);
    return bytes.subarray(0, 5).toString("ascii") === "%PDF-"
      && bytes.lastIndexOf(Buffer.from("%%EOF")) >= eofSearchStart;
  }
  if ([".doc", ".hwp", ".ppt"].includes(extension)) {
    if (!isOle(bytes)) return false;
    if (extension === ".doc") return containsOleStreamName(bytes, "WordDocument");
    if (extension === ".ppt") return containsOleStreamName(bytes, "PowerPoint Document");
    return containsOleStreamName(bytes, "FileHeader")
      && (containsOleStreamName(bytes, "BodyText") || containsOleStreamName(bytes, "DocInfo"));
  }
  if ([".docx", ".pptx", ".hwpx"].includes(extension)) {
    if (!isZip(bytes)) return false;
    if (extension === ".docx") {
      return containsContainerMarker(bytes, "[Content_Types].xml")
        && containsContainerMarker(bytes, "word/");
    }
    if (extension === ".pptx") {
      return containsContainerMarker(bytes, "[Content_Types].xml")
        && containsContainerMarker(bytes, "ppt/");
    }
    return containsContainerMarker(bytes, "Contents/")
      && (containsContainerMarker(bytes, "content.hpf")
        || containsContainerMarker(bytes, "section0.xml"));
  }

  const jpeg = bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
  const png = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (extension === ".jpg" || extension === ".jpeg") {
    if (!jpeg) return false;
  } else if (extension === ".png") {
    if (!png) return false;
  } else if (extension === ".webp") {
    if (!webp) return false;
  } else {
    return false;
  }

  try {
    const metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: 40_000_000,
      sequentialRead: true,
    }).metadata();
    return Boolean(metadata.width && metadata.height);
  } catch {
    return false;
  }
}

export function safePaperAttachmentFileName(originalName: string, fallbackIndex = 0): string {
  const decodedName = originalName.split("").every(character => character.charCodeAt(0) <= 0xff)
    ? Buffer.from(originalName, "latin1").toString("utf8")
    : originalName;
  const usableName = decodedName.includes("\ufffd") ? originalName : decodedName;
  const basename = path.posix.basename(usableName.replace(/\\/g, "/"));
  const extension = path.extname(basename).toLowerCase();
  const rawStem = path.basename(basename, path.extname(basename)).normalize("NFKC");
  const sanitizedStem = rawStem
    .replace(/[\u0000-\u001f\u007f/\\<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 180);
  return `${sanitizedStem || `paper-attachment-${fallbackIndex + 1}`}${extension}`.slice(0, 255);
}

export class PaperAttachmentContentError extends Error {
  readonly code = "PAPER_ATTACHMENT_CONTENT_INVALID";

  constructor(message = "첨부파일의 확장자와 실제 파일 내용을 확인해주세요") {
    super(message);
    this.name = "PaperAttachmentContentError";
  }
}

export async function preparePaperAttachmentFiles(
  files: Express.Multer.File[],
): Promise<StoredPaperAttachmentInput[]> {
  const prepared: StoredPaperAttachmentInput[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const extension = path.extname(file.originalname).toLowerCase();
    if (!await hasValidContent(file)) throw new PaperAttachmentContentError();
    prepared.push({
      fileName: safePaperAttachmentFileName(file.originalname, index),
      mimeType: NORMALIZED_MIME_TYPES[extension],
      byteSize: file.buffer.length,
      data: file.buffer,
    });
  }
  return prepared;
}
