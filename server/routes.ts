import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { Server } from "http";
import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { ZipArchive, type ArchiverError } from "archiver";
import fs from "fs";
import multer from "multer";
import path from "path";
import sharp from "sharp";
import { z } from "zod";
import {
  getStorage,
  type IStorage,
  type PhotoAlbumWithImages,
  type PhotoImageMetadata,
  type PaperAttachmentMetadata,
  type PaperWithAttachments,
  type StoredPhotoImageInput,
} from "./storage";
import {
  MAX_PAPER_ATTACHMENTS,
  MAX_PAPER_TOTAL_ATTACHMENT_BYTES,
  PaperAttachmentContentError,
  paperAttachmentArrayUpload,
  paperAttachmentSingleUpload,
  preparePaperAttachmentFiles,
} from "./paper-attachments";
import {
  auditEvent,
  hashPassword,
  isPasswordHash,
  isSafeHttpUrl,
  rateLimit,
  requireAuth,
  requireRole,
  verifyPassword,
} from "./security";

const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });

const FILE_TYPES: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".hwp": ["application/x-hwp", "application/haansofthwp"],
  ".hwpx": ["application/zip", "application/x-hwpx"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 5 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!FILE_TYPES[extension]?.includes(file.mimetype)) {
      callback(new Error("UPLOAD_REJECTED"));
      return;
    }
    callback(null, true);
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요",
});
const bootstrapLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const commentLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10 });
const viewLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const downloadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "파일 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
});
const publicContentMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "콘텐츠 변경 요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
});
const photoUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "사진 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
});
const photoDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "사진 다운로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
});
const photoInlineImageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: "사진 조회 요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
});
const paperAttachmentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "논문 첨부파일 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
});
const paperAttachmentDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "첨부파일 다운로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요",
});
const photoImageRateLimit: RequestHandler = (req, res, next) => {
  const limiter = req.query.download === "1" ? photoDownloadLimiter : photoInlineImageLimiter;
  return limiter(req, res, next);
};

const MAX_PHOTO_FILES = 12;
const MAX_PHOTO_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OPTIMIZED_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PHOTO_ALBUM_BYTES = 30 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_INPUT_BYTES,
    files: MAX_PHOTO_FILES,
    fields: 4,
    fieldSize: 64 * 1024,
    // Busboy raises LIMIT_PART_COUNT when the configured count is reached,
    // so allow one sentinel part beyond the four metadata fields + 12 files.
    parts: MAX_PHOTO_FILES + 5,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (PHOTO_TYPES[extension] !== file.mimetype) {
      callback(new Error("PHOTO_UPLOAD_REJECTED"));
      return;
    }
    callback(null, true);
  },
});

const photoUploadMiddleware: RequestHandler = (req, res, next) => {
  photoUpload.array("images", MAX_PHOTO_FILES)(req, res, error => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "사진 한 장의 최대 크기는 8MB입니다"
        : error.code === "LIMIT_FILE_COUNT"
          ? "한 번에 최대 12장의 사진을 등록할 수 있습니다"
          : "사진 업로드 제한을 확인해주세요";
      return res.status(400).json({ error: message, code: "PHOTO_UPLOAD_REJECTED" });
    }
    if (error) {
      return res.status(400).json({
        error: "JPEG, PNG 또는 WebP 사진만 등록할 수 있습니다",
        code: "PHOTO_UPLOAD_REJECTED",
      });
    }
    next();
  });
};

type PhotoWorkLease = {
  workStarted: boolean;
  release: () => void;
};

const PHOTO_UPLOAD_LEASE_KEY = "photoUploadConcurrencyLease";
const PHOTO_ARCHIVE_LEASE_KEY = "photoArchiveConcurrencyLease";

function createPhotoWorkConcurrencyGuard(options: {
  maxConcurrent: number;
  leaseKey: string;
  auditAction: string;
  error: string;
  code: string;
}): RequestHandler {
  let activeWork = 0;
  return (req, res, next) => {
    if (req.aborted || res.destroyed || res.writableEnded) return;
    if (activeWork >= options.maxConcurrent) {
      auditEvent(req, options.auditAction);
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Retry-After", "1");
      return res.status(429).json({
        error: options.error,
        code: options.code,
      });
    }

    activeWork += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeWork = Math.max(0, activeWork - 1);
    };
    const lease: PhotoWorkLease = { workStarted: false, release };
    res.locals[options.leaseKey] = lease;
    const releaseBeforeWork = () => {
      if (!lease.workStarted) release();
    };
    req.once("aborted", releaseBeforeWork);
    res.once("finish", releaseBeforeWork);
    res.once("close", releaseBeforeWork);
    res.once("error", releaseBeforeWork);
    next();
  };
}

function beginPhotoWork(res: Response, leaseKey: string): () => void {
  const lease = res.locals[leaseKey] as PhotoWorkLease | undefined;
  if (!lease) {
    throw new Error(`Missing photo work lease: ${leaseKey}`);
  }
  lease.workStarted = true;
  return lease.release;
}

export function createPhotoUploadConcurrencyGuard(maxConcurrentUploads = 1): RequestHandler {
  return createPhotoWorkConcurrencyGuard({
    maxConcurrent: maxConcurrentUploads,
    leaseKey: PHOTO_UPLOAD_LEASE_KEY,
    auditAction: "photo_upload.concurrent_rejected",
    error: "다른 사진을 처리 중입니다. 잠시 후 다시 시도해주세요",
    code: "PHOTO_UPLOAD_BUSY",
  });
}

export function beginPhotoUploadWork(res: Response): () => void {
  return beginPhotoWork(res, PHOTO_UPLOAD_LEASE_KEY);
}

const photoUploadConcurrency = createPhotoUploadConcurrencyGuard();
const photoArchiveConcurrency = createPhotoWorkConcurrencyGuard({
  maxConcurrent: 2,
  leaseKey: PHOTO_ARCHIVE_LEASE_KEY,
  auditAction: "photo_archive.concurrent_rejected",
  error: "다른 사진 묶음을 생성 중입니다. 잠시 후 다시 시도해주세요",
  code: "PHOTO_ARCHIVE_BUSY",
});
const PAPER_ATTACHMENT_UPLOAD_LEASE_KEY = "paperAttachmentUploadConcurrencyLease";
const PAPER_ATTACHMENT_DOWNLOAD_LEASE_KEY = "paperAttachmentDownloadConcurrencyLease";
const paperAttachmentUploadConcurrency = createPhotoWorkConcurrencyGuard({
  maxConcurrent: 1,
  leaseKey: PAPER_ATTACHMENT_UPLOAD_LEASE_KEY,
  auditAction: "paper_attachment_upload.concurrent_rejected",
  error: "다른 논문 첨부파일을 처리 중입니다. 잠시 후 다시 시도해주세요",
  code: "PAPER_ATTACHMENT_UPLOAD_BUSY",
});
const paperAttachmentDownloadConcurrency = createPhotoWorkConcurrencyGuard({
  maxConcurrent: 4,
  leaseKey: PAPER_ATTACHMENT_DOWNLOAD_LEASE_KEY,
  auditAction: "paper_attachment_download.concurrent_rejected",
  error: "다른 첨부파일을 전송 중입니다. 잠시 후 다시 시도해주세요",
  code: "PAPER_ATTACHMENT_DOWNLOAD_BUSY",
});

const usernameSchema = z.string().trim().min(4).max(32).regex(/^[A-Za-z0-9._-]+$/);
const passwordSchema = z.string().min(10).max(128);
const nameSchema = z.string().trim().min(1).max(80);
const dateSchema = z.string().trim().regex(/^\d{4}[.-]\d{2}[.-]\d{2}$/);
const isoDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const photoDateSchema = isoDateSchema.refine(value => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}, "유효한 날짜를 입력해주세요");
const fileReferenceSchema = z.string().trim().max(300).refine(value => {
  if (!value.startsWith("/uploads/")) return false;
  const filename = value.slice("/uploads/".length);
  return filename.length > 0
    && filename.length <= 255
    && path.basename(filename) === filename
    && Boolean(FILE_TYPES[path.extname(filename).toLowerCase()])
    && !filename.includes("\0");
});
const websiteSchema = z.string().trim().max(2_048).refine(isSafeHttpUrl);

const adminCreateSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  name: nameSchema,
});
const bootstrapSetupSchema = adminCreateSchema.extend({
  setupCode: z.string().trim().min(32).max(128),
});
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) });
const passwordResetSchema = z.object({ password: passwordSchema });

const noticeCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(20_000),
  date: dateSchema,
  isImportant: z.boolean().default(false),
  files: z.array(fileReferenceSchema).max(5).default([]),
});
const noticeUpdateSchema = noticeCreateSchema
  .omit({ date: true })
  .partial()
  .refine(value => Object.keys(value).length > 0);

const nullableShortText = z.string().trim().max(300).nullable().optional();
const paperCreateSchema = z.object({
  category: z.enum(["conference", "journal"]),
  title: z.string().trim().min(1).max(300),
  authors: z.string().trim().min(1).max(1_000),
  firstAuthor: nullableShortText,
  correspondingAuthor: nullableShortText,
  venue: nullableShortText,
  journal: nullableShortText,
  volume: nullableShortText,
  year: z.string().trim().regex(/^\d{4}$/),
  abstract: z.string().trim().max(10_000).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  files: z.array(fileReferenceSchema).max(5).default([]),
  websiteUrl: websiteSchema.nullable(),
  date: dateSchema,
});
const paperUpdateSchema = paperCreateSchema
  .omit({ date: true })
  .partial()
  .refine(value => Object.keys(value).length > 0);
const emptyLegacyPaperFilesSchema = z.array(z.never()).max(0).optional();
const paperMultipartCreateSchema = paperCreateSchema
  .omit({ files: true })
  .extend({ files: emptyLegacyPaperFilesSchema })
  .strict();
const paperMultipartUpdateSchema = paperCreateSchema
  .omit({ date: true, files: true })
  .partial()
  .extend({
    files: emptyLegacyPaperFilesSchema,
    deleteAttachmentIds: z.array(z.number().int().positive()).max(MAX_PAPER_ATTACHMENTS).default([]),
  })
  .strict();

const httpsAttachmentSchema = z.string().trim().max(2_048).refine(value => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "첨부 주소는 HTTPS 주소여야 합니다");
const admissionGuidelineCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().max(20_000),
  organization: z.string().trim().min(1).max(120),
  date: isoDateSchema,
  attachmentUrl: httpsAttachmentSchema.nullable().optional(),
  attachmentName: z.string().trim().min(1).max(255).nullable().optional(),
});
const admissionGuidelineUpdateSchema = admissionGuidelineCreateSchema
  .partial()
  .refine(value => Object.keys(value).length > 0);
const commentSchema = z.object({ content: z.string().trim().min(1).max(2_000) });
const photoAlbumCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(20_000),
  organization: z.string().trim().min(1).max(120),
  date: photoDateSchema,
}).strict();
const photoAlbumUpdateSchema = photoAlbumCreateSchema
  .partial()
  .refine(value => Object.keys(value).length > 0);
const photoImageOrderSchema = z.object({
  imageIds: z.array(z.number().int().positive()).min(1).max(500),
}).strict();

const retiredPaperCommentWrite: RequestHandler = (_req, res) => res.status(410).json({
  error: "논문 댓글 기능은 종료되었습니다",
  code: "PAPER_COMMENT_API_RETIRED",
});

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const asyncHandler = (handler: AsyncRoute): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "입력값을 확인해주세요",
      code: "VALIDATION_ERROR",
      fields: parsed.error.issues.slice(0, 5).map(issue => issue.path.join(".")),
    });
    return null;
  }
  return parsed.data;
}

function parseMultipartJson<T extends z.ZodTypeAny>(
  schema: T,
  field: string,
  req: Request,
  res: Response,
): z.infer<T> | null {
  const value = req.body?.[field];
  if (typeof value !== "string" || value.length > 64 * 1024) {
    res.status(400).json({
      error: "논문 정보를 확인해주세요",
      code: "VALIDATION_ERROR",
      fields: [field],
    });
    return null;
  }
  let body: unknown;
  try {
    body = JSON.parse(value);
  } catch {
    res.status(400).json({
      error: "논문 정보를 확인해주세요",
      code: "VALIDATION_ERROR",
      fields: [field],
    });
    return null;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({
      error: "입력값을 확인해주세요",
      code: "VALIDATION_ERROR",
      fields: parsed.error.issues.slice(0, 5).map(issue => issue.path.join(".")),
    });
    return null;
  }
  return parsed.data;
}

function parseId(req: Request, res: Response): number | null {
  const result = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!result.success) {
    res.status(400).json({ error: "잘못된 식별자입니다", code: "INVALID_ID" });
    return null;
  }
  return result.data;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function publicComment<T extends { userId?: number | null }>(req: Request, comment: T) {
  const { userId: _userId, ...dto } = comment;
  return {
    ...dto,
    canEdit: Boolean(req.session.user)
      && (req.session.user!.role === "ADMIN" || comment.userId === req.session.user!.id),
  };
}

function publicAdmin(user: {
  id: number;
  username: string;
  name: string;
  role: string;
  status: string;
  passwordResetRequired: boolean;
  registeredAt: string;
  registeredTime: string;
}) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    status: user.status,
    passwordResetRequired: user.passwordResetRequired,
    registeredAt: user.registeredAt,
    registeredTime: user.registeredTime,
  };
}

function publicSessionUser(user: {
  id: number;
  username: string;
  name: string;
  role: "ADMIN" | "USER";
  authVersion: number;
}) {
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

function publicPhotoImage(image: PhotoImageMetadata) {
  return {
    id: image.id,
    albumId: image.albumId,
    fileName: image.fileName,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
    sortOrder: image.sortOrder,
    altText: image.altText,
    url: `/api/photo-images/${image.id}`,
    downloadUrl: `/api/photo-images/${image.id}?download=1`,
  };
}

function publicPhotoAlbum(record: PhotoAlbumWithImages, includeImages: boolean) {
  const { album, images } = record;
  const summary = {
    id: album.id,
    title: album.title,
    content: album.content,
    organization: album.organization,
    date: album.date,
    views: album.views,
    imageCount: images.length,
    coverImage: images[0] ? publicPhotoImage(images[0]) : null,
    downloadUrl: `/api/photos/${album.id}/download`,
  };
  return includeImages
    ? { ...summary, images: images.map(publicPhotoImage) }
    : summary;
}

function publicPaperAttachment(attachment: PaperAttachmentMetadata) {
  return {
    id: attachment.id,
    paperId: attachment.paperId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    sortOrder: attachment.sortOrder,
    createdAt: attachment.createdAt,
    downloadUrl: `/api/paper-attachments/${attachment.id}/download`,
  };
}

function publicPaper(paper: PaperWithAttachments) {
  return {
    ...paper,
    attachments: paper.attachments.map(publicPaperAttachment),
  };
}

function paperAttachmentFiles(req: Request): Express.Multer.File[] {
  return (req.files as Express.Multer.File[] | undefined) ?? [];
}

function requirePaperAttachmentFiles(req: Request, res: Response): Express.Multer.File[] | null {
  const files = paperAttachmentFiles(req);
  if (!files.length) {
    res.status(400).json({
      error: "첨부파일을 한 개 이상 선택해주세요",
      code: "PAPER_ATTACHMENT_REQUIRED",
    });
    return null;
  }
  return files;
}

function sendPaperAttachmentContentError(res: Response, error: unknown): boolean {
  if (!(error instanceof PaperAttachmentContentError)) return false;
  res.status(400).json({ error: error.message, code: error.code });
  return true;
}

function exceedsPaperAttachmentTotal(files: { byteSize: number }[]): boolean {
  return files.reduce((sum, file) => sum + file.byteSize, 0) > MAX_PAPER_TOTAL_ATTACHMENT_BYTES;
}

function hasValidPhotoMagic(file: Express.Multer.File): boolean {
  const bytes = file.buffer;
  const extension = path.extname(file.originalname).toLowerCase();
  const jpeg = bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
  const png = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";

  if ([".jpg", ".jpeg"].includes(extension)) return file.mimetype === "image/jpeg" && jpeg;
  if (extension === ".png") return file.mimetype === "image/png" && png;
  if (extension === ".webp") return file.mimetype === "image/webp" && webp;
  return false;
}

function safePhotoFileName(originalName: string, fallbackIndex: number): string {
  const decodedName = originalName.split("").every(character => character.charCodeAt(0) <= 0xff)
    ? Buffer.from(originalName, "latin1").toString("utf8")
    : originalName;
  const usableName = decodedName.includes("\ufffd") ? originalName : decodedName;
  const basename = path.posix.basename(usableName.replace(/\\/g, "/"));
  const extension = path.extname(basename);
  const rawStem = path.basename(basename, extension).normalize("NFKC");
  const sanitizedStem = rawStem
    .replace(/[\u0000-\u001f\u007f/\\<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 100);
  return `${sanitizedStem || `photo-${fallbackIndex + 1}`}.webp`;
}

class PhotoProcessingError extends Error {
  constructor(
    readonly code: "PHOTO_CONTENT_INVALID" | "PHOTO_OPTIMIZED_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "PhotoProcessingError";
  }
}

async function processPhotoFiles(
  files: Express.Multer.File[],
): Promise<StoredPhotoImageInput[]> {
  const optimized: StoredPhotoImageInput[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!hasValidPhotoMagic(file)) {
      throw new PhotoProcessingError("PHOTO_CONTENT_INVALID", "사진 파일의 형식과 내용을 확인해주세요");
    }
    try {
      const result = await sharp(file.buffer, {
        failOn: "error",
        limitInputPixels: 40_000_000,
        sequentialRead: true,
      })
        .rotate()
        .resize({
          width: 2000,
          height: 1500,
          fit: "inside",
          withoutEnlargement: true,
        })
        // Sharp omits EXIF/XMP/IPTC metadata unless keepMetadata/withMetadata is requested.
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });

      if (result.data.length > MAX_OPTIMIZED_PHOTO_BYTES) {
        throw new PhotoProcessingError(
          "PHOTO_OPTIMIZED_TOO_LARGE",
          "최적화된 사진 한 장의 크기는 3MB를 초과할 수 없습니다",
        );
      }
      if (!result.info.width || !result.info.height) {
        throw new PhotoProcessingError("PHOTO_CONTENT_INVALID", "사진 크기를 확인할 수 없습니다");
      }
      optimized.push({
        fileName: safePhotoFileName(file.originalname, index),
        mimeType: "image/webp",
        byteSize: result.data.length,
        width: result.info.width,
        height: result.info.height,
        data: result.data,
      });
    } catch (error) {
      if (error instanceof PhotoProcessingError) throw error;
      throw new PhotoProcessingError("PHOTO_CONTENT_INVALID", "손상되었거나 처리할 수 없는 사진입니다");
    }
  }
  return optimized;
}

function photoFiles(req: Request, res: Response): Express.Multer.File[] | null {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) {
    res.status(400).json({ error: "사진을 한 장 이상 선택해주세요", code: "PHOTO_REQUIRED" });
    return null;
  }
  return files;
}

function sendPhotoProcessingError(res: Response, error: unknown): boolean {
  if (!(error instanceof PhotoProcessingError)) return false;
  res.status(400).json({ error: error.message, code: error.code });
  return true;
}

function safeArchiveName(title: string): string {
  const name = title
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 80);
  return `${name || "photo-album"}.zip`;
}

function isMagicNumberValid(file: Express.Multer.File): boolean {
  const extension = path.extname(file.originalname).toLowerCase();
  const bytes = file.buffer;
  const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isZip = bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(bytes[2])
    && [0x04, 0x06, 0x08].includes(bytes[3]);
  const isOle = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

  if (extension === ".pdf") return isPdf;
  if ([".docx", ".xlsx", ".pptx", ".hwpx", ".zip"].includes(extension)) return isZip;
  if ([".doc", ".xls", ".ppt", ".hwp"].includes(extension)) return isOle;
  return false;
}

function sessionRegenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => error ? reject(error) : resolve());
  });
}

function sessionSave(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save(error => error ? reject(error) : resolve());
  });
}

function sessionDestroy(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy(error => error ? reject(error) : resolve());
  });
}

function currentKoreanDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return {
    registeredAt: `${value("year")}.${value("month")}.${value("day")}`,
    registeredTime: `${value("hour")}:${value("minute")}`,
  };
}

const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));

export async function registerRoutes(httpServer: Server, app: Express, storageOverride?: IStorage): Promise<Server> {
  const storage = storageOverride ?? getStorage();
  const configuredAdminUsername = process.env.ADMIN_USERNAME?.trim();
  const configuredAdminHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const hasConfiguredAdmin = Boolean(configuredAdminUsername && configuredAdminHash);
  const adminOnly: RequestHandler = (req, res, next) => {
    requireRole("ADMIN")(req, res, () => {
      const sessionUser = req.session.user!;
      if (sessionUser.id === 0) {
        if (hasConfiguredAdmin && sessionUser.username === configuredAdminUsername) return next();
        return res.status(403).json({ error: "관리자 세션을 다시 확인해주세요", code: "ADMIN_SESSION_INVALID" });
      }
      storage.getUser(sessionUser.id)
        .then(user => {
          if (!user || user.status !== "active" || user.role.toLowerCase() !== "admin") {
            return res.status(403).json({ error: "활성 관리자 계정이 아닙니다", code: "ADMIN_ACCOUNT_INACTIVE" });
          }
          if (user.authVersion !== sessionUser.authVersion) {
            return sessionDestroy(req)
              .then(() => res.status(401).json({ error: "보안을 위해 다시 로그인해주세요", code: "ADMIN_SESSION_STALE" }))
              .catch(next);
          }
          next();
        })
        .catch(next);
    });
  };

  const bootstrapTtlMs = 15 * 60 * 1000;
  let bootstrapCode: string | null = null;
  let bootstrapExpiresAt = 0;
  let bootstrapInProgress = false;

  async function bootstrapRequired(): Promise<boolean> {
    return !hasConfiguredAdmin && await storage.getActiveAdminCount() === 0;
  }

  async function ensureBootstrapCode(): Promise<void> {
    if (!await bootstrapRequired()) {
      bootstrapCode = null;
      bootstrapExpiresAt = 0;
      return;
    }
    if (bootstrapCode && bootstrapExpiresAt > Date.now()) return;
    bootstrapCode = randomBytes(32).toString("base64url");
    bootstrapExpiresAt = Date.now() + bootstrapTtlMs;
    console.warn(JSON.stringify({
      type: "admin_bootstrap",
      message: "No active administrator exists. Use this one-time setup code within 15 minutes.",
      setupCode: bootstrapCode,
      expiresAt: new Date(bootstrapExpiresAt).toISOString(),
    }));
  }

  app.use(["/api/admins", "/api/admin-bootstrap"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    next();
  });

  app.get("/uploads/:filename", downloadLimiter, asyncHandler(async (req, res) => {
    const filename = req.params.filename;
    const extension = path.extname(filename).toLowerCase();
    if (!filename || filename.length > 255 || path.basename(filename) !== filename || !FILE_TYPES[extension]) {
      return res.status(404).json({ error: "파일을 찾을 수 없습니다", code: "FILE_NOT_FOUND" });
    }
    const filePath = path.join(uploadsDir, filename);
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: "파일을 찾을 수 없습니다", code: "FILE_NOT_FOUND" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.download(filePath, filename);
  }));

  app.post("/api/upload", adminOnly, uploadLimiter, (req, res) => {
    upload.array("files", 5)(req, res, async error => {
      if (error instanceof multer.MulterError) {
        const message = error.code === "LIMIT_FILE_SIZE"
          ? "파일당 최대 크기는 10MB입니다"
          : "파일 업로드 제한을 확인해주세요";
        return res.status(400).json({ error: message, code: "UPLOAD_REJECTED" });
      }
      if (error) return res.status(400).json({ error: "허용되지 않은 파일입니다", code: "UPLOAD_REJECTED" });

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length || files.some(file => !isMagicNumberValid(file))) {
        return res.status(400).json({ error: "파일 형식 또는 파일 내용을 확인해주세요", code: "UPLOAD_REJECTED" });
      }
      const writtenPaths: string[] = [];
      try {
        const uploadedFiles = [];
        for (const file of files) {
          const extension = path.extname(file.originalname).toLowerCase();
          const storedName = `${randomUUID()}${extension}`;
          const storedPath = path.join(uploadsDir, storedName);
          await fs.promises.writeFile(storedPath, file.buffer, { flag: "wx", mode: 0o600 });
          writtenPaths.push(storedPath);
          uploadedFiles.push({
            name: path.basename(file.originalname).slice(0, 255),
            url: `/uploads/${storedName}`,
            size: file.size,
            type: extension.slice(1),
          });
        }
        auditEvent(req, "file.upload", `${uploadedFiles.length} file(s)`);
        return res.status(201).json({ files: uploadedFiles });
      } catch {
        await Promise.allSettled(writtenPaths.map(storedPath => fs.promises.unlink(storedPath)));
        return res.status(500).json({ error: "파일 저장에 실패했습니다", code: "UPLOAD_FAILED" });
      }
    });
  });

  app.get("/api/admin-bootstrap/status", asyncHandler(async (_req, res) => {
    const required = await bootstrapRequired();
    if (required) await ensureBootstrapCode();
    return res.json({
      required,
      expiresAt: required && bootstrapExpiresAt > Date.now()
        ? new Date(bootstrapExpiresAt).toISOString()
        : null,
    });
  }));

  app.post("/api/admin-bootstrap/setup", bootstrapLimiter, asyncHandler(async (req, res) => {
    const input = parseBody(bootstrapSetupSchema, req, res);
    if (!input) return;
    if (!await bootstrapRequired()) {
      return res.status(409).json({ error: "관리자 초기 설정이 이미 완료되었습니다", code: "BOOTSTRAP_NOT_REQUIRED" });
    }
    if (bootstrapInProgress) {
      return res.status(409).json({ error: "관리자 초기 설정이 진행 중입니다", code: "BOOTSTRAP_IN_PROGRESS" });
    }
    if (!bootstrapCode || bootstrapExpiresAt <= Date.now()) {
      bootstrapCode = null;
      bootstrapExpiresAt = 0;
      return res.status(410).json({ error: "초기 설정 코드가 만료되었습니다. 서버 로그에서 새 코드를 확인해주세요", code: "BOOTSTRAP_EXPIRED" });
    }
    const provided = Buffer.from(input.setupCode);
    const expected = Buffer.from(bootstrapCode);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      auditEvent(req, "admin.bootstrap_failed");
      return res.status(401).json({ error: "초기 설정 코드가 올바르지 않습니다", code: "BOOTSTRAP_CODE_INVALID" });
    }
    bootstrapInProgress = true;
    try {
      const result = await storage.createFirstAdminSafely({
        username: input.username,
        password: await hashPassword(input.password),
        name: input.name,
        ...currentKoreanDateTime(),
      });
      if (result.status === "already_exists") {
        bootstrapCode = null;
        bootstrapExpiresAt = 0;
        return res.status(409).json({ error: "관리자 초기 설정이 이미 완료되었습니다", code: "BOOTSTRAP_NOT_REQUIRED" });
      }
      const admin = result.admin;
      bootstrapCode = null;
      bootstrapExpiresAt = 0;
      await sessionRegenerate(req);
      req.session.user = { id: admin.id, username: admin.username, name: admin.name, role: "ADMIN", authVersion: admin.authVersion };
      req.session.createdAt = Date.now();
      await sessionSave(req);
      auditEvent(req, "admin.bootstrap_complete", `admin:${admin.id}`);
      return res.status(201).json(publicAdmin(admin));
    } finally {
      bootstrapInProgress = false;
    }
  }));

  app.get("/api/admins", adminOnly, asyncHandler(async (_req, res) => {
    const admins = (await storage.getAdmins()).map(publicAdmin);
    return res.json(admins);
  }));

  app.post("/api/admins", adminOnly, asyncHandler(async (req, res) => {
    const input = parseBody(adminCreateSchema, req, res);
    if (!input) return;
    if (await storage.getUserByUsername(input.username)) {
      return res.status(409).json({ error: "이미 사용 중인 아이디입니다", code: "USERNAME_TAKEN" });
    }
    let admin;
    try {
      admin = await storage.createAdmin({
        username: input.username,
        password: await hashPassword(input.password),
        name: input.name,
        ...currentKoreanDateTime(),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "이미 사용 중인 아이디입니다", code: "USERNAME_TAKEN" });
      }
      throw error;
    }
    auditEvent(req, "admin.create", `admin:${admin.id}`);
    return res.status(201).json(publicAdmin(admin));
  }));

  app.patch("/api/admins/:id/password", adminOnly, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    const input = parseBody(passwordResetSchema, req, res);
    if (!id || !input) return;
    const admin = await storage.getUser(id);
    if (!admin || admin.role.toLowerCase() !== "admin") {
      return res.status(404).json({ error: "관리자를 찾을 수 없습니다", code: "ADMIN_NOT_FOUND" });
    }
    await storage.updateUserPassword(id, await hashPassword(input.password));
    auditEvent(req, "admin.password_reset", `admin:${id}`);
    if (req.session.user!.id === id) {
      await sessionDestroy(req);
      res.clearCookie("dku.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      return res.json({ success: true, reauthenticationRequired: true });
    }
    return res.json({ success: true });
  }));

  app.delete("/api/admins/:id", adminOnly, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (req.session.user!.id === id) {
      return res.status(409).json({ error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다", code: "SELF_DELETE_BLOCKED" });
    }
    const result = await storage.deleteAdminSafely(id, hasConfiguredAdmin);
    if (result === "not_found") {
      return res.status(404).json({ error: "관리자를 찾을 수 없습니다", code: "ADMIN_NOT_FOUND" });
    }
    if (result === "last_admin") {
      return res.status(409).json({ error: "마지막 활성 관리자 계정은 삭제할 수 없습니다", code: "LAST_ADMIN_BLOCKED" });
    }
    auditEvent(req, "admin.delete", `admin:${id}`);
    return res.json({ success: true });
  }));

  app.get("/api/users", adminOnly, (_req, res) => res.status(410).json({
    error: "회원 관리 기능은 관리자 관리 기능으로 대체되었습니다",
    code: "USER_API_RETIRED",
  }));

  app.post("/api/users", (_req, res) => res.status(410).json({
    error: "공개 회원가입은 제공하지 않습니다",
    code: "SIGNUP_DISABLED",
  }));

  app.post("/api/users/login", loginLimiter, asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req, res);
    if (!input) return;

    if (configuredAdminUsername && input.username === configuredAdminUsername) {
      const valid = configuredAdminHash
        ? await verifyPassword(input.password, configuredAdminHash)
        : await verifyPassword(input.password, await dummyPasswordHash);
      if (!valid) {
        auditEvent(req, "auth.login_failed", "admin");
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다", code: "INVALID_CREDENTIALS" });
      }
      await sessionRegenerate(req);
      req.session.user = { id: 0, username: configuredAdminUsername, name: "관리자", role: "ADMIN", authVersion: 0 };
      req.session.createdAt = Date.now();
      await sessionSave(req);
      auditEvent(req, "auth.login_success", "admin");
      return res.json(publicSessionUser(req.session.user));
    }

    const user = await storage.getUserByUsername(input.username);
    if (!user) {
      await verifyPassword(input.password, await dummyPasswordHash);
      auditEvent(req, "auth.login_failed", "user");
      return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다", code: "INVALID_CREDENTIALS" });
    }
    if (user.status !== "active" || user.role.toLowerCase() !== "admin") {
      return res.status(403).json({ error: "사용할 수 없는 계정입니다", code: "ACCOUNT_DISABLED" });
    }
    if (user.passwordResetRequired || !isPasswordHash(user.password)) {
      return res.status(403).json({ error: "관리자에게 비밀번호 재설정을 요청해주세요", code: "PASSWORD_RESET_REQUIRED" });
    }
    if (!await verifyPassword(input.password, user.password)) {
      auditEvent(req, "auth.login_failed", "user");
      return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다", code: "INVALID_CREDENTIALS" });
    }
    await sessionRegenerate(req);
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: "ADMIN",
      authVersion: user.authVersion,
    };
    req.session.createdAt = Date.now();
    await sessionSave(req);
    auditEvent(req, "auth.login_success", `user:${user.id}`);
    return res.json(publicSessionUser(req.session.user));
  }));

  app.post("/api/users/logout", requireAuth, (req, res) => {
    auditEvent(req, "auth.logout");
    req.session.destroy(error => {
      if (error) return res.status(500).json({ error: "로그아웃에 실패했습니다", code: "LOGOUT_FAILED" });
      res.clearCookie("dku.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      return res.json({ success: true });
    });
  });

  app.get("/api/users/me", requireAuth, asyncHandler(async (req, res) => {
    const sessionUser = req.session.user!;
    if (sessionUser.id === 0) {
      if (hasConfiguredAdmin && sessionUser.username === configuredAdminUsername) {
        return res.json(publicSessionUser(sessionUser));
      }
    } else {
      const user = await storage.getUser(sessionUser.id);
      if (user
        && user.status === "active"
        && user.role.toLowerCase() === "admin"
        && isPasswordHash(user.password)
        && !user.passwordResetRequired
        && user.authVersion === sessionUser.authVersion) {
        return res.json(publicSessionUser(sessionUser));
      }
    }
    await sessionDestroy(req);
    res.clearCookie("dku.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res.status(401).json({ error: "로그인이 만료되었습니다", code: "SESSION_EXPIRED" });
  }));

  app.patch("/api/users/:id/password", adminOnly, (_req, res) => res.status(410).json({ error: "관리자 비밀번호 재설정 API를 이용해주세요", code: "USER_API_RETIRED" }));
  app.delete("/api/users/:id", adminOnly, (_req, res) => res.status(410).json({ error: "관리자 관리 API를 이용해주세요", code: "USER_API_RETIRED" }));

  app.get("/api/admissions", asyncHandler(async (_req, res) => {
    return res.json(await storage.getAdmissionGuidelines());
  }));

  app.get("/api/admissions/:id", asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const guideline = await storage.getAdmissionGuideline(id);
    if (!guideline) {
      return res.status(404).json({ error: "모집요강을 찾을 수 없습니다", code: "ADMISSION_NOT_FOUND" });
    }
    return res.json(guideline);
  }));

  app.post("/api/admissions", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const input = parseBody(admissionGuidelineCreateSchema, req, res);
    if (!input) return;
    const guideline = await storage.createAdmissionGuideline({
      ...input,
      views: 0,
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentName: input.attachmentName ?? null,
    });
    auditEvent(req, "admission.create", `admission:${guideline.id}`);
    return res.status(201).json(guideline);
  }));

  app.patch("/api/admissions/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    const input = parseBody(admissionGuidelineUpdateSchema, req, res);
    if (!id || !input) return;
    const guideline = await storage.updateAdmissionGuideline(id, input);
    if (!guideline) {
      return res.status(404).json({ error: "모집요강을 찾을 수 없습니다", code: "ADMISSION_NOT_FOUND" });
    }
    auditEvent(req, "admission.update", `admission:${id}`);
    return res.json(guideline);
  }));

  app.delete("/api/admissions/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (!await storage.getAdmissionGuideline(id)) {
      return res.status(404).json({ error: "모집요강을 찾을 수 없습니다", code: "ADMISSION_NOT_FOUND" });
    }
    await storage.deleteAdmissionGuideline(id);
    auditEvent(req, "admission.delete", `admission:${id}`);
    return res.json({ success: true });
  }));

  app.patch("/api/admissions/:id/views", viewLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const views = await storage.incrementAdmissionGuidelineViews(id);
    if (views === undefined) {
      return res.status(404).json({ error: "모집요강을 찾을 수 없습니다", code: "ADMISSION_NOT_FOUND" });
    }
    return res.json({ success: true, views });
  }));

  app.get("/api/photos", asyncHandler(async (_req, res) => {
    const albums = await storage.getPhotoAlbums();
    res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
    return res.json(albums.map(album => publicPhotoAlbum(album, false)));
  }));

  app.get("/api/photos/:id/download", photoDownloadLimiter, photoArchiveConcurrency, asyncHandler(async (req, res) => {
    const releaseArchive = beginPhotoWork(res, PHOTO_ARCHIVE_LEASE_KEY);
    try {
      const id = parseId(req, res);
      if (!id) return;
      const album = await storage.getPhotoAlbum(id);
      if (res.destroyed) return;
      if (!album) {
        return res.status(404).json({ error: "사진자료를 찾을 수 없습니다", code: "PHOTO_ALBUM_NOT_FOUND" });
      }
      const images = await storage.getPhotoAlbumImages(id);
      if (res.destroyed) return;
      if (!images.length) {
        return res.status(409).json({ error: "다운로드할 사진이 없습니다", code: "PHOTO_ALBUM_EMPTY" });
      }

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.attachment(safeArchiveName(album.album.title));
      res.type("application/zip");

      const archive = new ZipArchive({ store: true });
      const responseDone = new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        res.once("finish", finish);
        res.once("close", () => {
          archive.abort();
          finish();
        });
        res.once("error", () => {
          archive.abort();
          finish();
        });
      });
      archive.on("warning", (error: ArchiverError) => {
        console.warn(JSON.stringify({
          type: "photo_archive_warning",
          requestId: req.requestId,
          error: error.code ?? error.name,
        }));
      });
      archive.on("error", (error: ArchiverError) => {
        console.error(JSON.stringify({
          type: "photo_archive_error",
          requestId: req.requestId,
          error: error.name,
        }));
        if (!res.destroyed) res.destroy(error);
      });
      archive.pipe(res);
      images.forEach((image, index) => {
        const position = String(index + 1).padStart(2, "0");
        archive.append(image.data, { name: `${position}_${image.fileName}` });
      });
      auditEvent(req, "photo.download", `photo_album:${id}`);
      const finalizeDone = archive.finalize().catch(error => {
        if (!res.destroyed) res.destroy(error as Error);
      });
      await Promise.race([finalizeDone, responseDone]);
      if (!res.destroyed) {
        await finalizeDone;
        await responseDone;
      }
    } finally {
      releaseArchive();
    }
  }));

  app.get("/api/photos/:id", asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const album = await storage.getPhotoAlbum(id);
    if (!album) {
      return res.status(404).json({ error: "사진자료를 찾을 수 없습니다", code: "PHOTO_ALBUM_NOT_FOUND" });
    }
    res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
    return res.json(publicPhotoAlbum(album, true));
  }));

  app.patch("/api/photos/:id/views", viewLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const views = await storage.incrementPhotoAlbumViews(id);
    if (views === undefined) {
      return res.status(404).json({ error: "사진자료를 찾을 수 없습니다", code: "PHOTO_ALBUM_NOT_FOUND" });
    }
    auditEvent(req, "photo.view", `photo_album:${id}`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.json({ success: true, views });
  }));

  app.get("/api/photo-images/:id", photoImageRateLimit, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const image = await storage.getPhotoImage(id);
    if (!image) {
      return res.status(404).json({ error: "사진을 찾을 수 없습니다", code: "PHOTO_IMAGE_NOT_FOUND" });
    }

    const download = req.query.download === "1";
    const etag = `"photo-${image.id}-${image.byteSize}"`;
    res.setHeader("ETag", etag);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (download) {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.attachment(image.fileName);
      auditEvent(req, "photo_image.download", `photo_image:${id}`);
    } else {
      res.setHeader("Cache-Control", "public, no-cache, max-age=0, must-revalidate");
      if (req.get("If-None-Match") === etag) return res.status(304).end();
    }
    res.setHeader("Content-Length", String(image.byteSize));
    res.type(image.mimeType);
    return res.send(image.data);
  }));

  app.post("/api/photos", adminOnly, photoUploadConcurrency, photoUploadLimiter, photoUploadMiddleware, asyncHandler(async (req, res) => {
    const releaseUpload = beginPhotoUploadWork(res);
    try {
      const input = parseBody(photoAlbumCreateSchema, req, res);
      const files = photoFiles(req, res);
      if (!input || !files) return;
      const images = await processPhotoFiles(files);
      const totalBytes = images.reduce((sum, image) => sum + image.byteSize, 0);
      if (totalBytes > MAX_PHOTO_ALBUM_BYTES) {
        return res.status(400).json({
          error: "사진자료 한 건의 최적화 후 전체 크기는 30MB를 초과할 수 없습니다",
          code: "PHOTO_ALBUM_TOO_LARGE",
        });
      }
      const album = await storage.createPhotoAlbum(input, images);
      auditEvent(req, "photo.create", `photo_album:${album.album.id};images:${images.length}`);
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(201).json(publicPhotoAlbum(album, true));
    } catch (error) {
      if (sendPhotoProcessingError(res, error)) return;
      throw error;
    } finally {
      releaseUpload();
    }
  }));

  app.patch("/api/photos/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    const input = parseBody(photoAlbumUpdateSchema, req, res);
    if (!id || !input) return;
    const album = await storage.updatePhotoAlbum(id, input);
    if (!album) {
      return res.status(404).json({ error: "사진자료를 찾을 수 없습니다", code: "PHOTO_ALBUM_NOT_FOUND" });
    }
    auditEvent(req, "photo.update", `photo_album:${id}`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.json(publicPhotoAlbum(album, true));
  }));

  app.post("/api/photos/:id/images", adminOnly, photoUploadConcurrency, photoUploadLimiter, photoUploadMiddleware, asyncHandler(async (req, res) => {
    const releaseUpload = beginPhotoUploadWork(res);
    try {
      const id = parseId(req, res);
      const files = photoFiles(req, res);
      if (!id || !files) return;
      const images = await processPhotoFiles(files);
      const result = await storage.addPhotoImages(id, images, MAX_PHOTO_ALBUM_BYTES, MAX_PHOTO_FILES);
      if (result.status === "not_found") {
        return res.status(404).json({ error: "사진자료를 찾을 수 없습니다", code: "PHOTO_ALBUM_NOT_FOUND" });
      }
      if (result.status === "album_too_large") {
        return res.status(400).json({
          error: "사진자료 한 건의 최적화 후 전체 크기는 30MB를 초과할 수 없습니다",
          code: "PHOTO_ALBUM_TOO_LARGE",
        });
      }
      if (result.status === "album_full") {
        return res.status(400).json({
          error: "사진자료 한 건에는 최대 12장의 사진을 등록할 수 있습니다",
          code: "PHOTO_ALBUM_FULL",
        });
      }
      auditEvent(req, "photo_images.create", `photo_album:${id};images:${images.length}`);
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(201).json(publicPhotoAlbum(result.album, true));
    } catch (error) {
      if (sendPhotoProcessingError(res, error)) return;
      throw error;
    } finally {
      releaseUpload();
    }
  }));

  app.patch("/api/photos/:id/images/order", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    const input = parseBody(photoImageOrderSchema, req, res);
    if (!id || !input) return;
    const result = await storage.reorderPhotoImages(id, input.imageIds);
    if (result.status === "not_found") {
      return res.status(404).json({ error: "사진자료를 찾을 수 없습니다", code: "PHOTO_ALBUM_NOT_FOUND" });
    }
    if (result.status === "invalid_order") {
      return res.status(400).json({
        error: "현재 사진의 식별자를 중복 없이 모두 포함해야 합니다",
        code: "PHOTO_IMAGE_ORDER_INVALID",
      });
    }
    auditEvent(req, "photo_images.reorder", `photo_album:${id}`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.json(publicPhotoAlbum(result.album, true));
  }));

  app.delete("/api/photo-images/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const result = await storage.deletePhotoImageSafely(id);
    if (result === "not_found") {
      return res.status(404).json({ error: "사진을 찾을 수 없습니다", code: "PHOTO_IMAGE_NOT_FOUND" });
    }
    if (result === "last_image") {
      return res.status(409).json({
        error: "사진자료에는 최소 한 장의 사진이 있어야 합니다. 전체 게시물을 삭제해주세요",
        code: "LAST_PHOTO_IMAGE_BLOCKED",
      });
    }
    auditEvent(req, "photo_image.delete", `photo_image:${id}`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.json({ success: true });
  }));

  app.delete("/api/photos/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (!await storage.deletePhotoAlbum(id)) {
      return res.status(404).json({ error: "사진자료를 찾을 수 없습니다", code: "PHOTO_ALBUM_NOT_FOUND" });
    }
    auditEvent(req, "photo.delete", `photo_album:${id}`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.json({ success: true });
  }));

  app.get("/api/notices", asyncHandler(async (req, res) => {
    const notices = await storage.getNotices();
    res.json(await Promise.all(notices.map(async notice => ({
      ...notice,
      comments: (await storage.getNoticeComments(notice.id)).map(comment => publicComment(req, comment)),
    }))));
  }));

  app.get("/api/notices/:id", asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const notice = await storage.getNotice(id);
    if (!notice) return res.status(404).json({ error: "공지사항을 찾을 수 없습니다", code: "NOTICE_NOT_FOUND" });
    return res.json({ ...notice, comments: (await storage.getNoticeComments(id)).map(comment => publicComment(req, comment)) });
  }));

  app.post("/api/notices", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const input = parseBody(noticeCreateSchema, req, res);
    if (!input) return;
    const notice = await storage.createNotice({ ...input, views: 0 });
    auditEvent(req, "notice.create", `notice:${notice.id}`);
    return res.status(201).json({ ...notice, comments: [] });
  }));

  app.patch("/api/notices/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    const input = parseBody(noticeUpdateSchema, req, res);
    if (!id || !input) return;
    const notice = await storage.updateNotice(id, input);
    if (!notice) return res.status(404).json({ error: "공지사항을 찾을 수 없습니다", code: "NOTICE_NOT_FOUND" });
    auditEvent(req, "notice.update", `notice:${id}`);
    return res.json({ ...notice, comments: (await storage.getNoticeComments(id)).map(comment => publicComment(req, comment)) });
  }));

  app.delete("/api/notices/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (!await storage.getNotice(id)) return res.status(404).json({ error: "공지사항을 찾을 수 없습니다", code: "NOTICE_NOT_FOUND" });
    await storage.deleteNotice(id);
    auditEvent(req, "notice.delete", `notice:${id}`);
    return res.json({ success: true });
  }));

  app.patch("/api/notices/:id/views", viewLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (!await storage.getNotice(id)) return res.status(404).json({ error: "공지사항을 찾을 수 없습니다", code: "NOTICE_NOT_FOUND" });
    await storage.incrementNoticeViews(id);
    return res.json({ success: true });
  }));

  app.post("/api/notices/:id/comments", adminOnly, commentLimiter, asyncHandler(async (req, res) => {
    const noticeId = parseId(req, res);
    const input = parseBody(commentSchema, req, res);
    if (!noticeId || !input) return;
    if (!await storage.getNotice(noticeId)) return res.status(404).json({ error: "공지사항을 찾을 수 없습니다", code: "NOTICE_NOT_FOUND" });
    const comment = await storage.createNoticeComment({
      noticeId,
      userId: req.session.user!.id > 0 ? req.session.user!.id : null,
      author: req.session.user!.role === "ADMIN" ? "관리자" : req.session.user!.username,
      content: input.content,
      date: currentKoreanDateTime().registeredAt,
    });
    auditEvent(req, "notice_comment.create", `comment:${comment.id}`);
    return res.status(201).json(publicComment(req, comment));
  }));

  app.patch("/api/notice-comments/:id", adminOnly, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    const input = parseBody(commentSchema, req, res);
    if (!id || !input) return;
    const existing = await storage.getNoticeComment(id);
    if (!existing) return res.status(404).json({ error: "댓글을 찾을 수 없습니다", code: "COMMENT_NOT_FOUND" });
    if (req.session.user!.role !== "ADMIN" && existing.userId !== req.session.user!.id) {
      return res.status(403).json({ error: "댓글을 수정할 권한이 없습니다", code: "FORBIDDEN" });
    }
    const comment = await storage.updateNoticeComment(id, input.content);
    auditEvent(req, "notice_comment.update", `comment:${id}`);
    return res.json(publicComment(req, comment!));
  }));

  app.delete("/api/notice-comments/:id", adminOnly, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const existing = await storage.getNoticeComment(id);
    if (!existing) return res.status(404).json({ error: "댓글을 찾을 수 없습니다", code: "COMMENT_NOT_FOUND" });
    if (req.session.user!.role !== "ADMIN" && existing.userId !== req.session.user!.id) {
      return res.status(403).json({ error: "댓글을 삭제할 권한이 없습니다", code: "FORBIDDEN" });
    }
    await storage.deleteNoticeComment(id);
    auditEvent(req, "notice_comment.delete", `comment:${id}`);
    return res.json({ success: true });
  }));

  app.get("/api/paper-attachments/:id/download", paperAttachmentDownloadLimiter, paperAttachmentDownloadConcurrency, asyncHandler(async (req, res) => {
    const releaseDownload = beginPhotoWork(res, PAPER_ATTACHMENT_DOWNLOAD_LEASE_KEY);
    try {
      const id = parseId(req, res);
      if (!id) return;
      const attachment = await storage.getPaperAttachment(id);
      if (res.destroyed) return;
      if (!attachment) {
        return res.status(404).json({ error: "첨부파일을 찾을 수 없습니다", code: "PAPER_ATTACHMENT_NOT_FOUND" });
      }
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", String(attachment.byteSize));
      res.attachment(attachment.fileName);
      res.type(attachment.mimeType);
      auditEvent(req, "paper_attachment.download", `paper_attachment:${id}`);
      const responseDone = new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        res.once("finish", finish);
        res.once("close", finish);
        res.once("error", finish);
      });
      res.send(attachment.data);
      await responseDone;
    } finally {
      releaseDownload();
    }
  }));

  app.post(
    "/api/papers/:id/attachments",
    adminOnly,
    paperAttachmentUploadConcurrency,
    paperAttachmentUploadLimiter,
    paperAttachmentArrayUpload,
    asyncHandler(async (req, res) => {
      const releaseUpload = beginPhotoWork(res, PAPER_ATTACHMENT_UPLOAD_LEASE_KEY);
      try {
        const id = parseId(req, res);
        const files = requirePaperAttachmentFiles(req, res);
        if (!id || !files) return;
        const attachments = await preparePaperAttachmentFiles(files);
        if (exceedsPaperAttachmentTotal(attachments)) {
          return res.status(400).json({
            error: "논문 한 건의 전체 첨부파일 크기는 30MB를 초과할 수 없습니다",
            code: "PAPER_ATTACHMENTS_TOO_LARGE",
          });
        }
        const result = await storage.addPaperAttachments(
          id,
          attachments,
          MAX_PAPER_TOTAL_ATTACHMENT_BYTES,
          MAX_PAPER_ATTACHMENTS,
        );
        if (result.status === "not_found") {
          return res.status(404).json({ error: "논문을 찾을 수 없습니다", code: "PAPER_NOT_FOUND" });
        }
        if (result.status === "paper_full") {
          return res.status(400).json({
            error: "논문 한 건에는 최대 5개의 파일을 첨부할 수 있습니다",
            code: "PAPER_ATTACHMENTS_FULL",
          });
        }
        if (result.status === "paper_too_large") {
          return res.status(400).json({
            error: "논문 한 건의 전체 첨부파일 크기는 30MB를 초과할 수 없습니다",
            code: "PAPER_ATTACHMENTS_TOO_LARGE",
          });
        }
        auditEvent(req, "paper_attachments.create", `paper:${id};attachments:${attachments.length}`);
        res.setHeader("Cache-Control", "no-store, max-age=0");
        return res.status(201).json(publicPaper(result.paper));
      } catch (error) {
        if (sendPaperAttachmentContentError(res, error)) return;
        throw error;
      } finally {
        releaseUpload();
      }
    }),
  );

  app.put(
    "/api/paper-attachments/:id",
    adminOnly,
    paperAttachmentUploadConcurrency,
    paperAttachmentUploadLimiter,
    paperAttachmentSingleUpload,
    asyncHandler(async (req, res) => {
      const releaseUpload = beginPhotoWork(res, PAPER_ATTACHMENT_UPLOAD_LEASE_KEY);
      try {
        const id = parseId(req, res);
        const file = req.file;
        if (!id) return;
        if (!file) {
          return res.status(400).json({
            error: "교체할 첨부파일을 선택해주세요",
            code: "PAPER_ATTACHMENT_REQUIRED",
          });
        }
        const [attachment] = await preparePaperAttachmentFiles([file]);
        const result = await storage.replacePaperAttachment(
          id,
          attachment,
          MAX_PAPER_TOTAL_ATTACHMENT_BYTES,
        );
        if (result.status === "not_found") {
          return res.status(404).json({ error: "첨부파일을 찾을 수 없습니다", code: "PAPER_ATTACHMENT_NOT_FOUND" });
        }
        if (result.status === "paper_too_large") {
          return res.status(400).json({
            error: "논문 한 건의 전체 첨부파일 크기는 30MB를 초과할 수 없습니다",
            code: "PAPER_ATTACHMENTS_TOO_LARGE",
          });
        }
        auditEvent(req, "paper_attachment.replace", `paper_attachment:${id}`);
        res.setHeader("Cache-Control", "no-store, max-age=0");
        return res.json(publicPaperAttachment(result.attachment));
      } catch (error) {
        if (sendPaperAttachmentContentError(res, error)) return;
        throw error;
      } finally {
        releaseUpload();
      }
    }),
  );

  app.delete("/api/paper-attachments/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (!await storage.deletePaperAttachment(id)) {
      return res.status(404).json({ error: "첨부파일을 찾을 수 없습니다", code: "PAPER_ATTACHMENT_NOT_FOUND" });
    }
    auditEvent(req, "paper_attachment.delete", `paper_attachment:${id}`);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.json({ success: true });
  }));

  app.get("/api/papers", asyncHandler(async (_req, res) => {
    return res.json((await storage.getPapers()).map(publicPaper));
  }));

  app.get("/api/papers/:id", asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    const paper = await storage.getPaper(id);
    if (!paper) return res.status(404).json({ error: "논문을 찾을 수 없습니다", code: "PAPER_NOT_FOUND" });
    return res.json(publicPaper(paper));
  }));

  app.post("/api/papers", adminOnly, paperAttachmentUploadConcurrency, paperAttachmentUploadLimiter, publicContentMutationLimiter, paperAttachmentArrayUpload,
    asyncHandler(async (req, res) => {
      const releaseUpload = beginPhotoWork(res, PAPER_ATTACHMENT_UPLOAD_LEASE_KEY);
      try {
        const multipart = req.is("multipart/form-data");
        const input = multipart
          ? parseMultipartJson(paperMultipartCreateSchema, "paper", req, res)
          : parseBody(paperCreateSchema, req, res);
        if (!input) return;
        const attachments = multipart
          ? await preparePaperAttachmentFiles(paperAttachmentFiles(req))
          : [];
        if (exceedsPaperAttachmentTotal(attachments)) {
          return res.status(400).json({
            error: "논문 한 건의 전체 첨부파일 크기는 30MB를 초과할 수 없습니다",
            code: "PAPER_ATTACHMENTS_TOO_LARGE",
          });
        }
        const legacyFiles = "files" in input && Array.isArray(input.files)
          ? input.files.filter((file): file is string => typeof file === "string")
          : [];
        const paper = await storage.createPaper({ ...input, files: legacyFiles, views: 0 }, attachments);
        auditEvent(req, "paper.create", `paper:${paper.id};attachments:${attachments.length}`);
        res.setHeader("Cache-Control", "no-store, max-age=0");
        return res.status(201).json(publicPaper(paper));
      } catch (error) {
        if (sendPaperAttachmentContentError(res, error)) return;
        throw error;
      } finally {
        releaseUpload();
      }
    }),
  );

  app.patch("/api/papers/:id", adminOnly, paperAttachmentUploadConcurrency, paperAttachmentUploadLimiter, publicContentMutationLimiter, paperAttachmentArrayUpload,
    asyncHandler(async (req, res) => {
      const releaseUpload = beginPhotoWork(res, PAPER_ATTACHMENT_UPLOAD_LEASE_KEY);
      try {
        const id = parseId(req, res);
        if (!id) return;
        const multipart = req.is("multipart/form-data");
        if (!multipart) {
          const input = parseBody(paperUpdateSchema, req, res);
          if (!input) return;
          const paper = await storage.updatePaper(id, input);
          if (!paper) return res.status(404).json({ error: "논문을 찾을 수 없습니다", code: "PAPER_NOT_FOUND" });
          auditEvent(req, "paper.update", `paper:${id}`);
          return res.json(publicPaper(paper));
        }

        const input = parseMultipartJson(paperMultipartUpdateSchema, "paper", req, res);
        if (!input) return;
        const { deleteAttachmentIds, ...paperChanges } = input;
        const attachments = await preparePaperAttachmentFiles(paperAttachmentFiles(req));
        if (!Object.keys(paperChanges).length && !deleteAttachmentIds.length && !attachments.length) {
          return res.status(400).json({
            error: "수정할 논문 정보 또는 첨부파일을 선택해주세요",
            code: "VALIDATION_ERROR",
          });
        }
        const result = await storage.updatePaperWithAttachments(
          id,
          paperChanges,
          attachments,
          deleteAttachmentIds,
          MAX_PAPER_TOTAL_ATTACHMENT_BYTES,
          MAX_PAPER_ATTACHMENTS,
        );
        if (result.status === "not_found") {
          return res.status(404).json({ error: "논문을 찾을 수 없습니다", code: "PAPER_NOT_FOUND" });
        }
        if (result.status === "attachment_not_found") {
          return res.status(400).json({
            error: "삭제할 첨부파일이 현재 논문에 포함되어 있는지 확인해주세요",
            code: "PAPER_ATTACHMENT_NOT_FOUND",
          });
        }
        if (result.status === "paper_full") {
          return res.status(400).json({
            error: "논문 한 건에는 최대 5개의 파일을 첨부할 수 있습니다",
            code: "PAPER_ATTACHMENTS_FULL",
          });
        }
        if (result.status === "paper_too_large") {
          return res.status(400).json({
            error: "논문 한 건의 전체 첨부파일 크기는 30MB를 초과할 수 없습니다",
            code: "PAPER_ATTACHMENTS_TOO_LARGE",
          });
        }
        auditEvent(
          req,
          "paper.update",
          `paper:${id};attachments_added:${attachments.length};attachments_deleted:${deleteAttachmentIds.length}`,
        );
        res.setHeader("Cache-Control", "no-store, max-age=0");
        return res.json(publicPaper(result.paper));
      } catch (error) {
        if (sendPaperAttachmentContentError(res, error)) return;
        throw error;
      } finally {
        releaseUpload();
      }
    }),
  );

  app.delete("/api/papers/:id", adminOnly, publicContentMutationLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (!await storage.getPaper(id)) return res.status(404).json({ error: "논문을 찾을 수 없습니다", code: "PAPER_NOT_FOUND" });
    await storage.deletePaper(id);
    auditEvent(req, "paper.delete", `paper:${id}`);
    return res.json({ success: true });
  }));

  app.patch("/api/papers/:id/views", viewLimiter, asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (!id) return;
    if (!await storage.getPaper(id)) return res.status(404).json({ error: "논문을 찾을 수 없습니다", code: "PAPER_NOT_FOUND" });
    await storage.incrementPaperViews(id);
    return res.json({ success: true });
  }));

  app.post("/api/papers/:id/comments", retiredPaperCommentWrite);
  app.patch("/api/paper-comments/:id", retiredPaperCommentWrite);
  app.delete("/api/paper-comments/:id", retiredPaperCommentWrite);

  app.all("/api/talents", (_req, res) => res.status(410).json({
    error: "인재풀 등록 기능은 종료되었습니다. 이메일 문의를 이용해주세요",
    code: "TALENT_API_RETIRED",
  }));
  app.all("/api/talents/:id", (_req, res) => res.status(410).json({
    error: "인재풀 등록 기능은 종료되었습니다",
    code: "TALENT_API_RETIRED",
  }));

  return httpServer;
}
