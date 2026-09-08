import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import express from "express";
import session from "express-session";
import sharp from "sharp";
import {
  beginPhotoUploadWork,
  createPhotoUploadConcurrencyGuard,
  registerRoutes,
} from "../server/routes";
import {
  hashPassword,
  isPasswordHash,
  isSafeHttpUrl,
  rateLimit,
  requestIdMiddleware,
  requireAuth,
  requireRole,
  requireSameOrigin,
  resolveSessionSecret,
  verifyPassword,
} from "../server/security";
import { MemoryStorage } from "../server/storage";

function mockRequest(overrides: Record<string, unknown> = {}) {
  const headers = new Map<string, string>();
  const providedHeaders = overrides.headers as Record<string, string> | undefined;
  Object.entries(providedHeaders ?? {}).forEach(([name, value]) => headers.set(name.toLowerCase(), value));
  return Object.assign(new EventEmitter(), {
    method: "POST",
    protocol: "https",
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    session: {},
    get(name: string) { return headers.get(name.toLowerCase()); },
    ...overrides,
  }) as any;
}

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    locals: {} as Record<string, unknown>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { this.headers[name] = String(value); },
  } as any;
}

function mockEventResponse() {
  const response = new EventEmitter() as EventEmitter & ReturnType<typeof mockResponse>;
  Object.assign(response, mockResponse());
  return response;
}

const testPassword = () => randomBytes(24).toString("base64url");
const password = testPassword();
const wrongPassword = testPassword();
const hash = await hashPassword(password);

const uploadConcurrencyGuard = createPhotoUploadConcurrencyGuard(1);
const firstUploadResponse = mockEventResponse();
let firstUploadStarted = false;
uploadConcurrencyGuard(mockRequest(), firstUploadResponse, () => { firstUploadStarted = true; });
assert.equal(firstUploadStarted, true);
const releaseFirstUpload = beginPhotoUploadWork(firstUploadResponse as any);
firstUploadResponse.emit("close");
const blockedUploadResponse = mockEventResponse();
uploadConcurrencyGuard(mockRequest(), blockedUploadResponse, () => assert.fail("Concurrent upload must not start"));
assert.equal(blockedUploadResponse.statusCode, 429);
assert.equal((blockedUploadResponse.body as { code: string }).code, "PHOTO_UPLOAD_BUSY");
releaseFirstUpload();
const uploadAfterFinishResponse = mockEventResponse();
let uploadAfterFinishStarted = false;
uploadConcurrencyGuard(mockRequest(), uploadAfterFinishResponse, () => { uploadAfterFinishStarted = true; });
assert.equal(uploadAfterFinishStarted, true);
uploadAfterFinishResponse.emit("finish");
uploadAfterFinishResponse.emit("close");
const uploadAfterCloseResponse = mockEventResponse();
let uploadAfterCloseStarted = false;
uploadConcurrencyGuard(mockRequest(), uploadAfterCloseResponse, () => { uploadAfterCloseStarted = true; });
assert.equal(uploadAfterCloseStarted, true);
uploadAfterCloseResponse.emit("close");
const uploadAfterErrorResponse = mockEventResponse();
let uploadAfterErrorStarted = false;
uploadConcurrencyGuard(mockRequest(), uploadAfterErrorResponse, () => { uploadAfterErrorStarted = true; });
assert.equal(uploadAfterErrorStarted, true);
uploadAfterErrorResponse.emit("error", new Error("simulated response error"));
const alreadyAbortedUploadResponse = mockEventResponse();
let alreadyAbortedUploadStarted = false;
uploadConcurrencyGuard(
  mockRequest({ aborted: true }),
  alreadyAbortedUploadResponse,
  () => { alreadyAbortedUploadStarted = true; },
);
assert.equal(alreadyAbortedUploadStarted, false);
const uploadAfterPriorAbortResponse = mockEventResponse();
let uploadAfterPriorAbortStarted = false;
uploadConcurrencyGuard(mockRequest(), uploadAfterPriorAbortResponse, () => { uploadAfterPriorAbortStarted = true; });
assert.equal(uploadAfterPriorAbortStarted, true);
uploadAfterPriorAbortResponse.emit("close");

const routesSource = await readFile(new URL("../server/routes.ts", import.meta.url), "utf8");
const storageSource = await readFile(new URL("../server/storage.ts", import.meta.url), "utf8");
const publicRoutes = [
  ["get", "/uploads/:filename", "downloadLimiter, asyncHandler"],
  ["get", "/api/photos", "asyncHandler"],
  ["get", "/api/photos/:id", "asyncHandler"],
  ["get", "/api/photos/:id/download", "photoDownloadLimiter"],
  ["get", "/api/photo-images/:id", "photoImageRateLimit"],
] as const;
const routeSourceLines = routesSource.split(/\r?\n/);
for (const [method, route, middleware] of publicRoutes) {
  const declaration = routeSourceLines.find(line => line.includes(`app.${method}("${route}"`));
  assert.ok(
    declaration?.includes(middleware),
    `${method.toUpperCase()} ${route} must remain public and rate-limited`,
  );
  assert.equal(declaration.includes("adminOnly"), false);
}
for (const [method, route, limiter] of [
  ["post", "/api/notices", "publicContentMutationLimiter"],
  ["patch", "/api/notices/:id", "publicContentMutationLimiter"],
  ["delete", "/api/notices/:id", "publicContentMutationLimiter"],
  ["post", "/api/admissions", "publicContentMutationLimiter"],
  ["patch", "/api/admissions/:id", "publicContentMutationLimiter"],
  ["delete", "/api/admissions/:id", "publicContentMutationLimiter"],
  ["post", "/api/papers", "publicContentMutationLimiter"],
  ["patch", "/api/papers/:id", "publicContentMutationLimiter"],
  ["delete", "/api/papers/:id", "publicContentMutationLimiter"],
  ["post", "/api/upload", "uploadLimiter"],
  ["post", "/api/photos", "photoUploadLimiter"],
  ["patch", "/api/photos/:id", "publicContentMutationLimiter"],
  ["post", "/api/photos/:id/images", "photoUploadLimiter"],
  ["patch", "/api/photos/:id/images/order", "publicContentMutationLimiter"],
  ["delete", "/api/photo-images/:id", "publicContentMutationLimiter"],
  ["delete", "/api/photos/:id", "publicContentMutationLimiter"],
] as const) {
  const declaration = routeSourceLines.find(line => line.includes(`app.${method}("${route}"`));
  assert.ok(
    declaration?.includes("adminOnly"),
    `${method.toUpperCase()} ${route} must remain administrator-only`,
  );
  assert.ok(
    declaration.includes(limiter),
    `${method.toUpperCase()} ${route} must remain rate-limited`,
  );
  assert.ok(
    declaration.indexOf("adminOnly") < declaration.indexOf(limiter),
    `${method.toUpperCase()} ${route} must authenticate before applying the mutation limiter`,
  );
}
const photoViewDeclaration = routeSourceLines.find(line => line.includes('app.patch("/api/photos/:id/views"'));
assert.ok(photoViewDeclaration?.includes("viewLimiter"), "Photo view writes must remain rate-limited");
assert.equal(photoViewDeclaration?.includes("adminOnly"), false, "Photo view counting must remain public");
const photoArchiveDeclaration = routeSourceLines.find(line => line.includes('app.get("/api/photos/:id/download"'));
assert.ok(photoArchiveDeclaration?.includes("photoArchiveConcurrency"), "Photo ZIP downloads must be concurrency-limited");
assert.ok(
  (photoArchiveDeclaration?.indexOf("photoArchiveConcurrency") ?? -1)
    < (photoArchiveDeclaration?.indexOf("asyncHandler") ?? -1),
  "Photo ZIP concurrency must be acquired before loading image bytes",
);
assert.ok(routesSource.includes("hasValidPhotoMagic(file)"), "Photo content must be checked by magic number");
for (const route of ['app.post("/api/photos"', 'app.post("/api/photos/:id/images"']) {
  const declaration = routeSourceLines.find(line => line.includes(route));
  assert.ok(declaration?.includes("photoUploadConcurrency"), `${route} must limit upload concurrency`);
  assert.ok(
    (declaration?.indexOf("adminOnly") ?? -1) < (declaration?.indexOf("photoUploadConcurrency") ?? -1),
    `${route} must authenticate before acquiring an upload slot`,
  );
  assert.ok(
    (declaration?.indexOf("photoUploadConcurrency") ?? -1) < (declaration?.indexOf("photoUploadLimiter") ?? -1),
    `${route} busy retries must not consume the upload rate limit`,
  );
  assert.ok(
    (declaration?.indexOf("photoUploadConcurrency") ?? -1) < (declaration?.indexOf("photoUploadMiddleware") ?? -1),
    `${route} must acquire an upload slot before buffering multipart files`,
  );
}
for (const [label, pattern] of [
  ["paper create", /app\.post\("\/api\/papers",\s*adminOnly,\s*paperAttachmentUploadConcurrency,\s*paperAttachmentUploadLimiter,\s*publicContentMutationLimiter,\s*paperAttachmentArrayUpload,/s],
  ["paper atomic update", /app\.patch\("\/api\/papers\/:id",\s*adminOnly,\s*paperAttachmentUploadConcurrency,\s*paperAttachmentUploadLimiter,\s*publicContentMutationLimiter,\s*paperAttachmentArrayUpload,/s],
  ["paper attachment add", /app\.post\(\s*"\/api\/papers\/:id\/attachments",\s*adminOnly,\s*paperAttachmentUploadConcurrency,\s*paperAttachmentUploadLimiter,\s*paperAttachmentArrayUpload,/s],
  ["paper attachment replace", /app\.put\(\s*"\/api\/paper-attachments\/:id",\s*adminOnly,\s*paperAttachmentUploadConcurrency,\s*paperAttachmentUploadLimiter,\s*paperAttachmentSingleUpload,/s],
] as const) {
  assert.match(
    routesSource,
    pattern,
    `${label} must authenticate, acquire concurrency, rate-limit, then parse multipart in that order`,
  );
}
assert.ok(routesSource.includes("limitInputPixels: 40_000_000"), "Photo decoding must limit input pixels");
assert.ok(routesSource.includes(".webp({ quality: 82"), "Photos must be normalized to optimized WebP");
assert.ok(routesSource.includes("fieldSize: 64 * 1024"), "Korean 20k-character content must fit multipart parsing");
assert.equal(
  (storageSource.match(/existing\.length \+ images\.length > maxAlbumImages/g) ?? []).length,
  2,
  "Memory and database storage must both enforce the album image cap",
);
for (const [method, route] of [
  ["post", "/api/papers/:id/comments"],
  ["patch", "/api/paper-comments/:id"],
  ["delete", "/api/paper-comments/:id"],
] as const) {
  assert.ok(
    routesSource.includes(`app.${method}("${route}", retiredPaperCommentWrite)`),
    `${method.toUpperCase()} ${route} must remain retired`,
  );
}
assert.equal(routesSource.includes("storage.getPaperComments"), false);
assert.equal((routesSource.match(/await ensureBootstrapCode\(\);/g) ?? []).length, 1);

assert.equal(isPasswordHash(hash), true);
assert.equal(isPasswordHash("scrypt$v1$16384$8$1$invalid$invalid"), false);
assert.equal(hash.includes(password), false);
assert.equal(await verifyPassword(password, hash), true);
assert.equal(await verifyPassword(wrongPassword, hash), false);
assert.equal(isSafeHttpUrl("https://example.edu/paper"), true);
assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);

const configuredSession = resolveSessionSecret("x".repeat(32), true);
assert.equal(configuredSession.source, "configured");
assert.equal(configuredSession.reason, null);

const generatedSession = resolveSessionSecret("short-secret", true);
assert.equal(generatedSession.source, "generated");
assert.equal(generatedSession.reason, "too_short");
assert.ok(generatedSession.secret.length >= 64);
assert.notEqual(generatedSession.secret, "short-secret");

let nextCalls = 0;
const unauthenticatedResponse = mockResponse();
requireAuth(mockRequest(), unauthenticatedResponse, () => { nextCalls += 1; });
assert.equal(unauthenticatedResponse.statusCode, 401);
assert.equal(nextCalls, 0);

const forbiddenResponse = mockResponse();
requireRole("ADMIN")(mockRequest({ session: { user: { role: "USER" } } }), forbiddenResponse, () => { nextCalls += 1; });
assert.equal(forbiddenResponse.statusCode, 403);
assert.equal(nextCalls, 0);

const authorizedResponse = mockResponse();
requireRole("ADMIN")(mockRequest({ session: { user: { role: "ADMIN" } } }), authorizedResponse, () => { nextCalls += 1; });
assert.equal(nextCalls, 1);

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
try {
  const sameOriginResponse = mockResponse();
  requireSameOrigin(
    mockRequest({ headers: { origin: "https://graduate.example", host: "graduate.example", "sec-fetch-site": "same-origin" } }),
    sameOriginResponse,
    () => { nextCalls += 1; },
  );
  assert.equal(nextCalls, 2);

  const crossOriginResponse = mockResponse();
  requireSameOrigin(
    mockRequest({ headers: { origin: "https://untrusted.example", host: "graduate.example", "sec-fetch-site": "cross-site" } }),
    crossOriginResponse,
    () => { nextCalls += 1; },
  );
  assert.equal(crossOriginResponse.statusCode, 403);

  const missingOriginResponse = mockResponse();
  requireSameOrigin(mockRequest({ headers: { host: "graduate.example" } }), missingOriginResponse, () => { nextCalls += 1; });
  assert.equal(missingOriginResponse.statusCode, 403);
} finally {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
}

const limiter = rateLimit({ windowMs: 60_000, max: 2 });
const firstLimitResponse = mockResponse();
const secondLimitResponse = mockResponse();
const blockedLimitResponse = mockResponse();
limiter(mockRequest(), firstLimitResponse, () => { nextCalls += 1; });
limiter(mockRequest(), secondLimitResponse, () => { nextCalls += 1; });
limiter(mockRequest(), blockedLimitResponse, () => { nextCalls += 1; });
assert.equal(blockedLimitResponse.statusCode, 429);
assert.equal(blockedLimitResponse.headers["Retry-After"] !== undefined, true);

const storage = new MemoryStorage();
const firstAdmin = await storage.createAdmin({
  username: "first-admin",
  password: await hashPassword(testPassword()),
  name: "First Admin",
  registeredAt: "2026.08.23",
  registeredTime: "12:00",
});
assert.equal(await storage.getActiveAdminCount(), 1);
const firstAdminVersion = firstAdmin.authVersion;
await storage.updateUserPassword(firstAdmin.id, await hashPassword(testPassword()));
assert.equal((await storage.getUser(firstAdmin.id))?.authVersion, firstAdminVersion + 1);
assert.equal(await storage.deleteAdminSafely(firstAdmin.id, false), "last_admin");

const secondAdmin = await storage.createAdmin({
  username: "second-admin",
  password: await hashPassword(testPassword()),
  name: "Second Admin",
  registeredAt: "2026.08.23",
  registeredTime: "12:01",
});
assert.equal(await storage.deleteAdminSafely(secondAdmin.id, false), "deleted");
assert.equal(await storage.getActiveAdminCount(), 1);

const recoveryStorage = new MemoryStorage();
const legacyPlaintext = testPassword();
const legacyAdmin = await recoveryStorage.createAdmin({
  username: "legacy-admin",
  password: legacyPlaintext,
  name: "Legacy Admin",
  registeredAt: "2025.01.01",
  registeredTime: "09:00",
});
assert.equal(await recoveryStorage.getActiveAdminCount(), 0);
const recovered = await recoveryStorage.createFirstAdminSafely({
  username: "legacy-admin",
  password: await hashPassword(testPassword()),
  name: "Recovered Admin",
  registeredAt: "2026.08.23",
  registeredTime: "12:02",
});
assert.equal(recovered.status, "created");
if (recovered.status === "created") assert.equal(recovered.admin.id, legacyAdmin.id);
assert.equal(await recoveryStorage.getActiveAdminCount(), 1);
assert.equal((await recoveryStorage.createFirstAdminSafely({
  username: "another-admin",
  password: await hashPassword(testPassword()),
  name: "Another Admin",
  registeredAt: "2026.08.23",
  registeredTime: "12:03",
})).status, "already_exists");

const guideline = await storage.createAdmissionGuideline({
  title: "Graduate admission guide",
  content: "Official application information",
  organization: "Dankook University Graduate School",
  date: "2026-08-23",
  views: 0,
  attachmentUrl: "https://grad.dankook.ac.kr/-91",
  attachmentName: "Official guide",
});
assert.equal(await storage.incrementAdmissionGuidelineViews(guideline.id), 1);
assert.equal((await storage.getAdmissionGuideline(guideline.id))?.views, 1);

const olderGuideline = await storage.createAdmissionGuideline({
  title: "Older admission guide",
  content: "Older official application information",
  organization: "Dankook University Graduate School",
  date: "2025-12-01",
  views: 0,
  attachmentUrl: null,
  attachmentName: null,
});
const newestGuideline = await storage.createAdmissionGuideline({
  title: "Newest admission guide",
  content: "Newest official application information",
  organization: "Dankook University Graduate School",
  date: "2027-01-15",
  views: 0,
  attachmentUrl: null,
  attachmentName: null,
});
const sameDateGuideline = await storage.createAdmissionGuideline({
  title: "Same-date admission guide",
  content: "Same-date official application information",
  organization: "Dankook University Graduate School",
  date: "2027-01-15",
  views: 0,
  attachmentUrl: null,
  attachmentName: null,
});
assert.deepEqual(
  (await storage.getAdmissionGuidelines()).map((item) => item.id),
  [sameDateGuideline.id, newestGuideline.id, guideline.id, olderGuideline.id],
);

const updatedGuideline = await storage.updateAdmissionGuideline(guideline.id, { title: "Updated graduate admission guide" });
assert.equal(updatedGuideline?.title, "Updated graduate admission guide");
await storage.deleteAdmissionGuideline(olderGuideline.id);
assert.equal(await storage.getAdmissionGuideline(olderGuideline.id), undefined);

const notice = await storage.createNotice({
  title: "Operations notice",
  content: "Administrator-managed notice content",
  date: "2026.08.24",
  views: 0,
  isImportant: false,
  files: [],
});
assert.equal((await storage.updateNotice(notice.id, { title: "Updated operations notice" }))?.title, "Updated operations notice");
await storage.deleteNotice(notice.id);
assert.equal(await storage.getNotice(notice.id), undefined);

const memoryPaperAttachment = (name: string, size = 8) => ({
  fileName: name,
  mimeType: "application/pdf",
  byteSize: size,
  data: Buffer.alloc(size, 7),
});
const paper = await storage.createPaper({
  category: "journal",
  title: "Operations paper",
  authors: "Dankook Graduate School",
  firstAuthor: null,
  correspondingAuthor: null,
  venue: null,
  journal: null,
  volume: null,
  year: "2026",
  abstract: null,
  keywords: [],
  files: [],
  websiteUrl: "https://example.edu/paper",
  date: "2026.08.24",
  views: 0,
}, [memoryPaperAttachment("논문.pdf")]);
assert.equal(paper.attachments.length, 1);
assert.equal("data" in paper.attachments[0], false);
assert.deepEqual(
  (await storage.getPaperAttachment(paper.attachments[0].id))?.data,
  Buffer.alloc(8, 7),
);
assert.equal((await storage.updatePaper(paper.id, { title: "Updated operations paper" }))?.title, "Updated operations paper");
const addedPaperAttachment = await storage.addPaperAttachments(
  paper.id,
  [memoryPaperAttachment("발표자료.pdf")],
  30,
  5,
);
assert.equal(addedPaperAttachment.status, "created");
const atomicPaperUpdate = await storage.updatePaperWithAttachments(
  paper.id,
  { title: "Atomically updated operations paper" },
  [memoryPaperAttachment("교체자료.pdf")],
  [paper.attachments[0].id],
  30,
  5,
);
assert.equal(atomicPaperUpdate.status, "updated");
if (atomicPaperUpdate.status === "updated") {
  assert.equal(atomicPaperUpdate.paper.title, "Atomically updated operations paper");
  assert.equal(atomicPaperUpdate.paper.attachments.length, 2);
  assert.equal("data" in atomicPaperUpdate.paper.attachments[0], false);
}
assert.equal(
  (await storage.addPaperAttachments(paper.id, [memoryPaperAttachment("too-large.pdf", 31)], 30, 5)).status,
  "paper_too_large",
);
await storage.deletePaper(paper.id);
assert.equal(await storage.getPaper(paper.id), undefined);
assert.equal(await storage.getPaperAttachment(paper.attachments[0].id), undefined);

const memoryPhotoImage = (name: string, size = 4) => ({
  fileName: name,
  mimeType: "image/webp",
  byteSize: size,
  width: 2,
  height: 2,
  data: Buffer.alloc(size, 1),
});
const photoAlbum = await storage.createPhotoAlbum({
  title: "Security photo album",
  content: "Memory-only photo gallery fixture",
  organization: "Dankook Graduate School",
  date: "2026-09-08",
}, [memoryPhotoImage("first.webp"), memoryPhotoImage("second.webp")]);
assert.equal(photoAlbum.images.length, 2);
assert.equal("data" in photoAlbum.images[0], false);
assert.equal(photoAlbum.images[0].altText, "Security photo album 사진 1");
assert.equal(await storage.incrementPhotoAlbumViews(photoAlbum.album.id), 1);
assert.equal((await storage.getPhotoAlbum(photoAlbum.album.id))?.album.views, 1);
const fullPhotoImage = await storage.getPhotoImage(photoAlbum.images[0].id);
assert.deepEqual(fullPhotoImage?.data, Buffer.alloc(4, 1));

const reversedPhotoIds = [...photoAlbum.images].reverse().map(image => image.id);
const reorderedPhotoAlbum = await storage.reorderPhotoImages(photoAlbum.album.id, reversedPhotoIds);
assert.equal(reorderedPhotoAlbum.status, "updated");
if (reorderedPhotoAlbum.status === "updated") {
  assert.deepEqual(reorderedPhotoAlbum.album.images.map(image => image.id), reversedPhotoIds);
  assert.equal(reorderedPhotoAlbum.album.images[0].altText, "Security photo album 사진 1");
}
assert.equal(
  (await storage.reorderPhotoImages(photoAlbum.album.id, [reversedPhotoIds[0]])).status,
  "invalid_order",
);
assert.equal(
  (await storage.addPhotoImages(
    photoAlbum.album.id,
    Array.from({ length: 11 }, (_, index) => memoryPhotoImage(`extra-${index}.webp`)),
    30 * 1024 * 1024,
    12,
  )).status,
  "album_full",
);
assert.equal((await storage.getPhotoAlbum(photoAlbum.album.id))?.images.length, 2);
assert.equal(
  (await storage.addPhotoImages(
    photoAlbum.album.id,
    [{ ...memoryPhotoImage("too-large.webp"), byteSize: 30 * 1024 * 1024 }],
    30 * 1024 * 1024,
    12,
  )).status,
  "album_too_large",
);
assert.equal(await storage.deletePhotoImageSafely(reversedPhotoIds[0]), "deleted");
assert.equal(await storage.deletePhotoImageSafely(reversedPhotoIds[1]), "last_image");
assert.equal(await storage.deletePhotoAlbum(photoAlbum.album.id), true);
assert.equal(await storage.getPhotoImage(reversedPhotoIds[1]), undefined);

const integrationStorage = new MemoryStorage();
const integrationAdminPassword = testPassword();
const integrationAdmin = await integrationStorage.createAdmin({
  username: `admin-${randomBytes(8).toString("hex")}`,
  password: await hashPassword(integrationAdminPassword),
  name: "Integration Admin",
  registeredAt: "2026.08.31",
  registeredTime: "18:00",
});
const protectedNotice = await integrationStorage.createNotice({
  title: "Protected notice integration fixture",
  content: "This fixture must not change without an administrator session",
  date: "2026.08.31",
  views: 0,
  isImportant: false,
  files: [],
});
const protectedAdmission = await integrationStorage.createAdmissionGuideline({
  title: "Protected admission integration fixture",
  content: "This fixture must not change without an administrator session",
  organization: "Dankook Graduate School",
  date: "2026-08-31",
  views: 0,
  attachmentUrl: null,
  attachmentName: null,
});
const protectedPaper = await integrationStorage.createPaper({
  category: "conference",
  title: "Protected conference integration fixture",
  authors: "Dankook Graduate School",
  firstAuthor: null,
  correspondingAuthor: null,
  venue: "Security Integration Conference",
  journal: null,
  volume: null,
  year: "2026",
  abstract: null,
  keywords: [],
  files: [],
  websiteUrl: "https://example.edu/protected-conference",
  date: "2026.08.31",
  views: 0,
}, [{
  fileName: "protected.pdf",
  mimeType: "application/pdf",
  byteSize: 8,
  data: Buffer.alloc(8, 3),
}]);
const integrationApp = express();
const integrationServer = createServer(integrationApp);
const integrationNodeEnv = process.env.NODE_ENV;
const originalConsoleInfo = console.info;
let integrationAdmissionId: number | null = null;
let integrationNoticeId: number | null = null;
let integrationPaperId: number | null = null;
let integrationPhotoAlbumId: number | null = null;
let integrationFullPhotoAlbumId: number | null = null;

process.env.NODE_ENV = "production";
console.info = () => {};
integrationApp.set("trust proxy", 1);
integrationApp.use(requestIdMiddleware);
integrationApp.use(express.json({ limit: "256kb" }));
integrationApp.use(session({
  secret: randomBytes(32).toString("base64url"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false },
}));
integrationApp.use("/api", requireSameOrigin);

try {
  await registerRoutes(integrationServer, integrationApp, integrationStorage);
  await new Promise<void>((resolve, reject) => {
    integrationServer.once("error", reject);
    integrationServer.listen(0, "127.0.0.1", resolve);
  });
  const address = integrationServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(method: string, route: string, body?: unknown, origin = baseUrl, cookie?: string) {
    return await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        Origin: origin,
        "Sec-Fetch-Site": origin === baseUrl ? "same-origin" : "cross-site",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function requestMultipart(
    method: "POST" | "PATCH" | "PUT",
    route: string,
    formData: FormData,
    origin = baseUrl,
    cookie?: string,
  ) {
    return await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        Origin: origin,
        "Sec-Fetch-Site": origin === baseUrl ? "same-origin" : "cross-site",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: formData,
    });
  }
  async function requestForm(route: string, formData: FormData, origin = baseUrl, cookie?: string) {
    return await requestMultipart("POST", route, formData, origin, cookie);
  }

  const photoPng = await sharp({
    create: {
      width: 12,
      height: 8,
      channels: 3,
      background: { r: 15, g: 74, b: 130 },
    },
  }).png().toBuffer();
  const paperJpeg = await sharp(photoPng).jpeg().toBuffer();
  const paperWebp = await sharp(photoPng).webp().toBuffer();
  const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const oleDocument = (...streamNames: string[]) => Buffer.concat([
    oleHeader,
    ...streamNames.map(name => Buffer.from(name, "utf16le")),
  ]);
  const zipContainer = (...markers: string[]) => Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    ...markers.map(marker => Buffer.from(marker, "utf8")),
  ]);
  function photoForm(title = "Administrator photo integration test", imageCount = 1) {
    const form = new FormData();
    form.append("title", title);
    form.append("content", "Memory-only photo gallery content");
    form.append("organization", "Dankook Graduate School");
    form.append("date", "2026-09-08");
    for (let index = 0; index < imageCount; index += 1) {
      form.append("images", new Blob([photoPng], { type: "image/png" }), `사진-자료실-${index + 1}.png`);
    }
    return form;
  }
  function photoImagesForm(count: number) {
    const form = new FormData();
    for (let index = 0; index < count; index += 1) {
      form.append("images", new Blob([photoPng], { type: "image/png" }), `fixture-${index + 1}.png`);
    }
    return form;
  }

  const paperPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  function paperForm(
    input: Record<string, unknown>,
    files: Array<{ name: string; type: string; data: Buffer }> = [
      { name: "학술대회-논문.pdf", type: "application/pdf", data: paperPdf },
    ],
  ) {
    const form = new FormData();
    form.append("paper", JSON.stringify(input));
    files.forEach(file => {
      form.append("attachments", new Blob([file.data], { type: file.type }), file.name);
    });
    return form;
  }

  const admissionInput = {
    title: "Administrator admission integration test",
    content: "Memory-only admission content",
    organization: "Dankook Graduate School",
    date: "2026-08-24",
    attachmentUrl: null,
    attachmentName: null,
  };
  const paperInput = {
    category: "journal",
    title: "Administrator journal integration test",
    authors: "Dankook Graduate School",
    firstAuthor: null,
    correspondingAuthor: null,
    venue: null,
    journal: "Security Integration Journal",
    volume: null,
    year: "2026",
    abstract: null,
    keywords: [],
    files: [],
    websiteUrl: "https://example.edu/administrator-paper",
    date: "2026.08.24",
  };

  const admissionCountBeforeUnauthorizedRequests = (await integrationStorage.getAdmissionGuidelines()).length;
  const unauthorizedAdmissionCreateResponse = await request("POST", "/api/admissions", admissionInput);
  assert.equal(unauthorizedAdmissionCreateResponse.status, 401);
  assert.equal((await unauthorizedAdmissionCreateResponse.json() as { code: string }).code, "AUTH_REQUIRED");
  assert.equal((await integrationStorage.getAdmissionGuidelines()).length, admissionCountBeforeUnauthorizedRequests);

  const unauthorizedAdmissionPatchResponse = await request(
    "PATCH",
    `/api/admissions/${protectedAdmission.id}`,
    { title: "Unauthorized admission update must not persist" },
  );
  assert.equal(unauthorizedAdmissionPatchResponse.status, 401);
  assert.equal(
    (await integrationStorage.getAdmissionGuideline(protectedAdmission.id))?.title,
    protectedAdmission.title,
  );

  const unauthorizedAdmissionDeleteResponse = await request(
    "DELETE",
    `/api/admissions/${protectedAdmission.id}`,
  );
  assert.equal(unauthorizedAdmissionDeleteResponse.status, 401);
  assert.ok(await integrationStorage.getAdmissionGuideline(protectedAdmission.id));

  const paperCountBeforeUnauthorizedRequests = (await integrationStorage.getPapers()).length;
  const unauthorizedPaperCreateResponse = await request("POST", "/api/papers", paperInput);
  assert.equal(unauthorizedPaperCreateResponse.status, 401);
  assert.equal((await unauthorizedPaperCreateResponse.json() as { code: string }).code, "AUTH_REQUIRED");
  assert.equal((await integrationStorage.getPapers()).length, paperCountBeforeUnauthorizedRequests);

  const unauthorizedPaperPatchResponse = await request(
    "PATCH",
    `/api/papers/${protectedPaper.id}`,
    { title: "Unauthorized paper update must not persist" },
  );
  assert.equal(unauthorizedPaperPatchResponse.status, 401);
  assert.equal((await integrationStorage.getPaper(protectedPaper.id))?.title, protectedPaper.title);

  const unauthorizedPaperDeleteResponse = await request("DELETE", `/api/papers/${protectedPaper.id}`);
  assert.equal(unauthorizedPaperDeleteResponse.status, 401);
  assert.ok(await integrationStorage.getPaper(protectedPaper.id));

  const unauthorizedPaperMultipartCreateResponse = await requestForm("/api/papers", paperForm(paperInput));
  assert.equal(unauthorizedPaperMultipartCreateResponse.status, 401);
  const protectedAttachmentId = protectedPaper.attachments[0].id;
  assert.equal(
    (await requestForm(`/api/papers/${protectedPaper.id}/attachments`, paperForm(paperInput))).status,
    401,
  );
  assert.equal(
    (await requestMultipart(
      "PUT",
      `/api/paper-attachments/${protectedAttachmentId}`,
      paperForm(paperInput),
    )).status,
    401,
  );
  assert.equal((await request("DELETE", `/api/paper-attachments/${protectedAttachmentId}`)).status, 401);
  assert.ok(await integrationStorage.getPaperAttachment(protectedAttachmentId));

  const unauthorizedUploadResponse = await request("POST", "/api/upload");
  assert.equal(unauthorizedUploadResponse.status, 401);
  assert.equal((await unauthorizedUploadResponse.json() as { code: string }).code, "AUTH_REQUIRED");

  const unauthorizedPhotoCreateResponse = await requestForm("/api/photos", photoForm());
  assert.equal(unauthorizedPhotoCreateResponse.status, 401);
  assert.equal((await unauthorizedPhotoCreateResponse.json() as { code: string }).code, "AUTH_REQUIRED");
  assert.equal((await integrationStorage.getPhotoAlbums()).length, 0);

  const unauthorizedPhotoPatchResponse = await request("PATCH", "/api/photos/1", { title: "Unauthorized" });
  assert.equal(unauthorizedPhotoPatchResponse.status, 401);
  const unauthorizedPhotoDeleteResponse = await request("DELETE", "/api/photos/1");
  assert.equal(unauthorizedPhotoDeleteResponse.status, 401);

  const noticeInput = {
    title: "Administrator notice integration test",
    content: "Memory-only notice content",
    date: "2026.08.24",
    isImportant: false,
    files: [],
  };
  const noticeCountBeforeUnauthorizedRequests = (await integrationStorage.getNotices()).length;
  const unauthorizedNoticeCreateResponse = await request("POST", "/api/notices", noticeInput);
  assert.equal(unauthorizedNoticeCreateResponse.status, 401);
  assert.equal((await unauthorizedNoticeCreateResponse.json() as { code: string }).code, "AUTH_REQUIRED");
  assert.equal((await integrationStorage.getNotices()).length, noticeCountBeforeUnauthorizedRequests);

  const unauthorizedNoticePatchResponse = await request(
    "PATCH",
    `/api/notices/${protectedNotice.id}`,
    { title: "Unauthorized update must not persist" },
  );
  assert.equal(unauthorizedNoticePatchResponse.status, 401);
  assert.equal((await integrationStorage.getNotice(protectedNotice.id))?.title, protectedNotice.title);

  const unauthorizedNoticeDeleteResponse = await request("DELETE", `/api/notices/${protectedNotice.id}`);
  assert.equal(unauthorizedNoticeDeleteResponse.status, 401);
  assert.ok(await integrationStorage.getNotice(protectedNotice.id));

  const loginResponse = await request("POST", "/api/users/login", {
    username: integrationAdmin.username,
    password: integrationAdminPassword,
  });
  assert.equal(loginResponse.status, 200);
  assert.equal((await loginResponse.json() as { role: string }).role, "ADMIN");
  const setCookie = loginResponse.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const adminCookie = setCookie.split(";", 1)[0];

  const currentAdminResponse = await request("GET", "/api/users/me", undefined, baseUrl, adminCookie);
  assert.equal(currentAdminResponse.status, 200);
  assert.equal((await currentAdminResponse.json() as { role: string }).role, "ADMIN");

  const rejectedNoticeCount = (await integrationStorage.getNotices()).length;
  const rejectedNoticeOriginResponse = await request(
    "POST",
    "/api/notices",
    noticeInput,
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedNoticeOriginResponse.status, 403);
  assert.equal((await rejectedNoticeOriginResponse.json() as { code: string }).code, "ORIGIN_REJECTED");
  assert.equal((await integrationStorage.getNotices()).length, rejectedNoticeCount);

  const rejectedAdmissionCount = (await integrationStorage.getAdmissionGuidelines()).length;
  const rejectedAdmissionOriginCreateResponse = await request(
    "POST",
    "/api/admissions",
    admissionInput,
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedAdmissionOriginCreateResponse.status, 403);
  assert.equal(
    (await rejectedAdmissionOriginCreateResponse.json() as { code: string }).code,
    "ORIGIN_REJECTED",
  );
  assert.equal((await integrationStorage.getAdmissionGuidelines()).length, rejectedAdmissionCount);

  const rejectedAdmissionOriginPatchResponse = await request(
    "PATCH",
    `/api/admissions/${protectedAdmission.id}`,
    { title: "Cross-origin admission update must not persist" },
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedAdmissionOriginPatchResponse.status, 403);
  assert.equal(
    (await integrationStorage.getAdmissionGuideline(protectedAdmission.id))?.title,
    protectedAdmission.title,
  );

  const rejectedAdmissionOriginDeleteResponse = await request(
    "DELETE",
    `/api/admissions/${protectedAdmission.id}`,
    undefined,
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedAdmissionOriginDeleteResponse.status, 403);
  assert.ok(await integrationStorage.getAdmissionGuideline(protectedAdmission.id));

  const rejectedPaperCount = (await integrationStorage.getPapers()).length;
  const rejectedPaperOriginCreateResponse = await request(
    "POST",
    "/api/papers",
    paperInput,
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedPaperOriginCreateResponse.status, 403);
  assert.equal((await rejectedPaperOriginCreateResponse.json() as { code: string }).code, "ORIGIN_REJECTED");
  assert.equal((await integrationStorage.getPapers()).length, rejectedPaperCount);

  const rejectedPaperOriginPatchResponse = await request(
    "PATCH",
    `/api/papers/${protectedPaper.id}`,
    { title: "Cross-origin paper update must not persist" },
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedPaperOriginPatchResponse.status, 403);
  assert.equal((await integrationStorage.getPaper(protectedPaper.id))?.title, protectedPaper.title);

  const rejectedPaperOriginDeleteResponse = await request(
    "DELETE",
    `/api/papers/${protectedPaper.id}`,
    undefined,
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedPaperOriginDeleteResponse.status, 403);
  assert.ok(await integrationStorage.getPaper(protectedPaper.id));

  const rejectedPaperMultipartOriginCreateResponse = await requestForm(
    "/api/papers",
    paperForm(paperInput),
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedPaperMultipartOriginCreateResponse.status, 403);
  const rejectedPaperAttachmentOriginAddResponse = await requestForm(
    `/api/papers/${protectedPaper.id}/attachments`,
    paperForm(paperInput),
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedPaperAttachmentOriginAddResponse.status, 403);

  const rejectedUploadOriginResponse = await request(
    "POST",
    "/api/upload",
    undefined,
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedUploadOriginResponse.status, 403);
  assert.equal((await rejectedUploadOriginResponse.json() as { code: string }).code, "ORIGIN_REJECTED");

  const rejectedPhotoOriginResponse = await requestForm(
    "/api/photos",
    photoForm("Cross-origin photo must not persist"),
    "https://untrusted.example",
    adminCookie,
  );
  assert.equal(rejectedPhotoOriginResponse.status, 403);
  assert.equal((await rejectedPhotoOriginResponse.json() as { code: string }).code, "ORIGIN_REJECTED");
  assert.equal((await integrationStorage.getPhotoAlbums()).length, 0);

  const noticeCreateResponse = await request("POST", "/api/notices", noticeInput, baseUrl, adminCookie);
  assert.equal(noticeCreateResponse.status, 201);
  const integrationNotice = await noticeCreateResponse.json() as { id: number };
  integrationNoticeId = integrationNotice.id;
  assert.equal((await request(
    "PATCH",
    `/api/notices/${integrationNotice.id}`,
    { title: "Updated administrator notice" },
    baseUrl,
    adminCookie,
  )).status, 200);
  assert.equal((await request(
    "DELETE",
    `/api/notices/${integrationNotice.id}`,
    undefined,
    baseUrl,
    adminCookie,
  )).status, 200);
  assert.equal(await integrationStorage.getNotice(integrationNotice.id), undefined);

  const admissionCreateResponse = await request(
    "POST",
    "/api/admissions",
    admissionInput,
    baseUrl,
    adminCookie,
  );
  assert.equal(admissionCreateResponse.status, 201);
  const integrationAdmission = await admissionCreateResponse.json() as { id: number };
  integrationAdmissionId = integrationAdmission.id;
  const admissionPatchResponse = await request(
    "PATCH",
    `/api/admissions/${integrationAdmission.id}`,
    { title: "Updated administrator admission" },
    baseUrl,
    adminCookie,
  );
  assert.equal(admissionPatchResponse.status, 200);
  assert.equal(
    (await integrationStorage.getAdmissionGuideline(integrationAdmission.id))?.title,
    "Updated administrator admission",
  );
  assert.equal((await request(
    "DELETE",
    `/api/admissions/${integrationAdmission.id}`,
    undefined,
    baseUrl,
    adminCookie,
  )).status, 200);
  assert.equal(await integrationStorage.getAdmissionGuideline(integrationAdmission.id), undefined);

  const invalidDocxResponse = await requestForm(
    "/api/papers",
    paperForm(
      { ...paperInput, title: "Renamed generic ZIP must be rejected" },
      [{
        name: "not-a-word-document.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
      }],
    ),
    baseUrl,
    adminCookie,
  );
  assert.equal(invalidDocxResponse.status, 400);
  assert.equal((await invalidDocxResponse.json() as { code: string }).code, "PAPER_ATTACHMENT_CONTENT_INVALID");

  const paperCountBeforeExcessFileRequest = (await integrationStorage.getPapers()).length;
  const excessFileCountResponse = await requestForm(
    "/api/papers",
    paperForm(
      { ...paperInput, title: "Six paper files must be rejected" },
      Array.from({ length: 6 }, (_, index) => ({
        name: `excess-${index + 1}.pdf`,
        type: "application/pdf",
        data: paperPdf,
      })),
    ),
    baseUrl,
    adminCookie,
  );
  assert.equal(excessFileCountResponse.status, 400);
  assert.equal((await excessFileCountResponse.json() as { code: string }).code, "PAPER_ATTACHMENT_REJECTED");
  assert.equal((await integrationStorage.getPapers()).length, paperCountBeforeExcessFileRequest);

  const supportedPaperFiles = [
    { name: "paper.pdf", type: "application/pdf", data: paperPdf, expectedMime: "application/pdf" },
    { name: "paper.doc", type: "application/msword", data: oleDocument("WordDocument"), expectedMime: "application/msword" },
    {
      name: "paper.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      data: zipContainer("[Content_Types].xml", "word/document.xml"),
      expectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    { name: "paper.hwp", type: "application/x-hwp", data: oleDocument("FileHeader", "BodyText"), expectedMime: "application/x-hwp" },
    { name: "paper.hwpx", type: "application/vnd.hancom.hwpx", data: zipContainer("Contents/", "content.hpf"), expectedMime: "application/vnd.hancom.hwpx" },
    { name: "slides.ppt", type: "application/vnd.ms-powerpoint", data: oleDocument("PowerPoint Document"), expectedMime: "application/vnd.ms-powerpoint" },
    {
      name: "slides.pptx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      data: zipContainer("[Content_Types].xml", "ppt/presentation.xml"),
      expectedMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    { name: "figure.jpg", type: "image/jpeg", data: paperJpeg, expectedMime: "image/jpeg" },
    { name: "figure.png", type: "image/png", data: photoPng, expectedMime: "image/png" },
    { name: "figure.webp", type: "image/webp", data: paperWebp, expectedMime: "image/webp" },
  ];
  for (let groupIndex = 0; groupIndex < supportedPaperFiles.length; groupIndex += 5) {
    const group = supportedPaperFiles.slice(groupIndex, groupIndex + 5);
    const supportedFormatsResponse = await requestForm(
      "/api/papers",
      paperForm({
        ...paperInput,
        category: "conference",
        title: `Supported conference attachment formats ${groupIndex / 5 + 1}`,
        venue: "Security Integration Conference",
        journal: null,
      }, group),
      baseUrl,
      adminCookie,
    );
    assert.equal(supportedFormatsResponse.status, 201);
    const supportedFormatsPaper = await supportedFormatsResponse.json() as {
      id: number;
      category: string;
      attachments: Array<{ fileName: string; mimeType: string }>;
    };
    assert.equal(supportedFormatsPaper.category, "conference");
    assert.deepEqual(supportedFormatsPaper.attachments.map(file => file.fileName), group.map(file => file.name));
    assert.deepEqual(supportedFormatsPaper.attachments.map(file => file.mimeType), group.map(file => file.expectedMime));
    assert.equal((await request(
      "DELETE",
      `/api/papers/${supportedFormatsPaper.id}`,
      undefined,
      baseUrl,
      adminCookie,
    )).status, 200);
  }

  const paperCreateResponse = await requestForm(
    "/api/papers",
    paperForm(paperInput),
    baseUrl,
    adminCookie,
  );
  assert.equal(paperCreateResponse.status, 201);
  const integrationPaper = await paperCreateResponse.json() as {
    id: number;
    attachments: Array<{
      id: number;
      fileName: string;
      mimeType: string;
      byteSize: number;
      downloadUrl: string;
    }>;
  };
  integrationPaperId = integrationPaper.id;
  assert.equal(integrationPaper.attachments.length, 1);
  assert.equal("data" in integrationPaper.attachments[0], false);
  const originalPaperAttachmentId = integrationPaper.attachments[0].id;
  const paperGetResponse = await fetch(`${baseUrl}/api/papers/${integrationPaper.id}`);
  assert.equal(paperGetResponse.status, 200);
  const paperDetail = await paperGetResponse.json() as Record<string, unknown> & {
    attachments: Array<Record<string, unknown>>;
  };
  assert.equal("comments" in paperDetail, false);
  assert.equal("data" in paperDetail.attachments[0], false);
  const paperListResponse = await fetch(`${baseUrl}/api/papers`);
  assert.equal(paperListResponse.status, 200);
  assert.equal(JSON.stringify(await paperListResponse.json()).includes("file_data"), false);

  const paperDownloadResponse = await fetch(
    `${baseUrl}${integrationPaper.attachments[0].downloadUrl}`,
  );
  assert.equal(paperDownloadResponse.status, 200);
  assert.match(paperDownloadResponse.headers.get("content-disposition") ?? "", /^attachment;/i);
  assert.match(paperDownloadResponse.headers.get("content-disposition") ?? "", /filename\*=UTF-8''/i);
  assert.match(paperDownloadResponse.headers.get("content-type") ?? "", /^application\/pdf/i);
  assert.match(paperDownloadResponse.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(paperDownloadResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await paperDownloadResponse.arrayBuffer()), paperPdf);

  const originalGetPaperAttachment = integrationStorage.getPaperAttachment.bind(integrationStorage);
  let concurrentPaperAttachmentReads = 0;
  let releasePaperAttachmentReads!: () => void;
  const paperAttachmentReadGate = new Promise<void>(resolve => { releasePaperAttachmentReads = resolve; });
  integrationStorage.getPaperAttachment = async id => {
    concurrentPaperAttachmentReads += 1;
    await paperAttachmentReadGate;
    return await originalGetPaperAttachment(id);
  };
  const paperAttachmentControllers = Array.from({ length: 4 }, () => new AbortController());
  const concurrentPaperAttachmentDownloads = paperAttachmentControllers.map(controller => fetch(
    `${baseUrl}${integrationPaper.attachments[0].downloadUrl}`,
    { signal: controller.signal },
  ).catch(error => error as Error));
  try {
    for (let attempt = 0; attempt < 100 && concurrentPaperAttachmentReads < 4; attempt += 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    assert.equal(concurrentPaperAttachmentReads, 4);
    paperAttachmentControllers.forEach(controller => controller.abort());
    const rejectedConcurrentPaperDownload = await fetch(
      `${baseUrl}${integrationPaper.attachments[0].downloadUrl}`,
    );
    assert.equal(rejectedConcurrentPaperDownload.status, 429);
    assert.equal(
      (await rejectedConcurrentPaperDownload.json() as { code: string }).code,
      "PAPER_ATTACHMENT_DOWNLOAD_BUSY",
    );
  } finally {
    releasePaperAttachmentReads();
    await Promise.all(concurrentPaperAttachmentDownloads);
    integrationStorage.getPaperAttachment = originalGetPaperAttachment;
  }

  const addAttachmentForm = new FormData();
  addAttachmentForm.append(
    "attachments",
    new Blob([paperPdf], { type: "application/pdf" }),
    "추가자료.pdf",
  );
  const paperAttachmentAddResponse = await requestMultipart(
    "POST",
    `/api/papers/${integrationPaper.id}/attachments`,
    addAttachmentForm,
    baseUrl,
    adminCookie,
  );
  assert.equal(paperAttachmentAddResponse.status, 201);
  const paperAfterAdd = await paperAttachmentAddResponse.json() as {
    attachments: Array<{ id: number }>;
  };
  assert.equal(paperAfterAdd.attachments.length, 2);
  const addedPaperAttachmentId = paperAfterAdd.attachments.find(
    attachment => attachment.id !== originalPaperAttachmentId,
  )!.id;

  const replacementForm = new FormData();
  replacementForm.append(
    "attachment",
    new Blob([paperPdf], { type: "application/pdf" }),
    "수정된-추가자료.pdf",
  );
  const paperAttachmentReplaceResponse = await requestMultipart(
    "PUT",
    `/api/paper-attachments/${addedPaperAttachmentId}`,
    replacementForm,
    baseUrl,
    adminCookie,
  );
  assert.equal(paperAttachmentReplaceResponse.status, 200);
  assert.equal(
    (await paperAttachmentReplaceResponse.json() as { fileName: string }).fileName,
    "수정된-추가자료.pdf",
  );

  const paperPatchResponse = await requestMultipart(
    "PATCH",
    `/api/papers/${integrationPaper.id}`,
    paperForm({
      title: "Updated administrator journal",
      deleteAttachmentIds: [originalPaperAttachmentId, addedPaperAttachmentId],
    }),
    baseUrl,
    adminCookie,
  );
  assert.equal(paperPatchResponse.status, 200);
  const paperAfterAtomicPatch = await paperPatchResponse.json() as {
    title: string;
    attachments: Array<{ id: number }>;
  };
  assert.equal(paperAfterAtomicPatch.title, "Updated administrator journal");
  assert.equal(paperAfterAtomicPatch.attachments.length, 1);
  assert.notEqual(paperAfterAtomicPatch.attachments[0].id, originalPaperAttachmentId);
  const finalPaperAttachmentId = paperAfterAtomicPatch.attachments[0].id;
  assert.equal(
    (await fetch(`${baseUrl}/api/paper-attachments/${originalPaperAttachmentId}/download`)).status,
    404,
  );
  assert.equal(
    (await integrationStorage.getPaper(integrationPaper.id))?.title,
    "Updated administrator journal",
  );

  assert.equal((await request("POST", `/api/papers/${integrationPaper.id}/comments`, { content: "Retired" })).status, 410);
  assert.equal((await request("PATCH", "/api/paper-comments/1", { content: "Retired" })).status, 410);
  assert.equal((await request("DELETE", "/api/paper-comments/1")).status, 410);

  assert.equal((await request(
    "DELETE",
    `/api/papers/${integrationPaper.id}`,
    undefined,
    baseUrl,
    adminCookie,
  )).status, 200);
  assert.equal(await integrationStorage.getPaper(integrationPaper.id), undefined);
  assert.equal(await integrationStorage.getPaperAttachment(finalPaperAttachmentId), undefined);

  const photoCreateResponse = await requestForm("/api/photos", photoForm(), baseUrl, adminCookie);
  assert.equal(photoCreateResponse.status, 201);
  const integrationPhoto = await photoCreateResponse.json() as {
    id: number;
    title: string;
    imageCount: number;
    coverImage: { id: number; url: string; downloadUrl: string; mimeType: string; altText: string };
    images: Array<{ id: number; fileName: string; url: string; downloadUrl: string; mimeType: string; altText: string }>;
  };
  integrationPhotoAlbumId = integrationPhoto.id;
  assert.equal(integrationPhoto.imageCount, 1);
  assert.equal(integrationPhoto.images.length, 1);
  assert.equal(integrationPhoto.images[0].fileName, "사진-자료실-1.webp");
  assert.equal(integrationPhoto.images[0].mimeType, "image/webp");
  assert.equal(integrationPhoto.images[0].altText, `${integrationPhoto.title} 사진 1`);
  assert.equal("data" in integrationPhoto.images[0], false);
  assert.equal(integrationPhoto.coverImage.url, `/api/photo-images/${integrationPhoto.images[0].id}`);
  assert.equal(
    integrationPhoto.coverImage.downloadUrl,
    `/api/photo-images/${integrationPhoto.images[0].id}?download=1`,
  );

  const photoListResponse = await fetch(`${baseUrl}/api/photos`);
  assert.equal(photoListResponse.status, 200);
  const photoList = await photoListResponse.json() as Array<Record<string, unknown>>;
  assert.equal(photoList.length, 1);
  assert.equal("images" in photoList[0], false);
  assert.equal(JSON.stringify(photoList).includes("image_data"), false);

  const photoDetailResponse = await fetch(`${baseUrl}/api/photos/${integrationPhoto.id}`);
  assert.equal(photoDetailResponse.status, 200);
  assert.equal(JSON.stringify(await photoDetailResponse.json()).includes("image_data"), false);

  const photoViewResponse = await request("PATCH", `/api/photos/${integrationPhoto.id}/views`);
  assert.equal(photoViewResponse.status, 200);
  assert.equal((await photoViewResponse.json() as { views: number }).views, 1);

  const invalidPhotoDateResponse = await request(
    "PATCH",
    `/api/photos/${integrationPhoto.id}`,
    { date: "2026-02-31" },
    baseUrl,
    adminCookie,
  );
  assert.equal(invalidPhotoDateResponse.status, 400);
  const photoPatchResponse = await request(
    "PATCH",
    `/api/photos/${integrationPhoto.id}`,
    { title: "Updated administrator photo album" },
    baseUrl,
    adminCookie,
  );
  assert.equal(photoPatchResponse.status, 200);

  const firstPhotoId = integrationPhoto.images[0].id;
  const imageResponse = await fetch(`${baseUrl}/api/photo-images/${firstPhotoId}`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("ratelimit-limit"), "600");
  assert.equal(imageResponse.headers.get("content-type"), "image/webp");
  assert.match(imageResponse.headers.get("cache-control") ?? "", /no-cache/);
  assert.equal((imageResponse.headers.get("cache-control") ?? "").includes("immutable"), false);
  const optimizedImage = Buffer.from(await imageResponse.arrayBuffer());
  assert.equal(optimizedImage.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(optimizedImage.subarray(8, 12).toString("ascii"), "WEBP");

  const imageDownloadResponse = await fetch(`${baseUrl}/api/photo-images/${firstPhotoId}?download=1`);
  assert.equal(imageDownloadResponse.status, 200);
  assert.equal(imageDownloadResponse.headers.get("ratelimit-limit"), "60");
  assert.match(imageDownloadResponse.headers.get("content-disposition") ?? "", /^attachment;/i);
  assert.match(imageDownloadResponse.headers.get("cache-control") ?? "", /no-store/);
  await imageDownloadResponse.arrayBuffer();

  const addPhotoResponse = await requestForm(
    `/api/photos/${integrationPhoto.id}/images`,
    photoForm("ignored multipart metadata"),
    baseUrl,
    adminCookie,
  );
  assert.equal(addPhotoResponse.status, 201);
  const photoWithTwoImages = await addPhotoResponse.json() as {
    images: Array<{ id: number; sortOrder: number; altText: string }>;
  };
  assert.equal(photoWithTwoImages.images.length, 2);
  const orderedIds = photoWithTwoImages.images.map(image => image.id).reverse();
  const reorderPhotoResponse = await request(
    "PATCH",
    `/api/photos/${integrationPhoto.id}/images/order`,
    { imageIds: orderedIds },
    baseUrl,
    adminCookie,
  );
  assert.equal(reorderPhotoResponse.status, 200);
  const reorderedImages = (await reorderPhotoResponse.json() as {
    images: Array<{ id: number; sortOrder: number; altText: string }>;
  }).images;
  assert.deepEqual(reorderedImages.map(image => image.id), orderedIds);
  assert.deepEqual(reorderedImages.map(image => image.sortOrder), [0, 1]);
  assert.equal(reorderedImages[0].altText, "Updated administrator photo album 사진 1");

  const albumDownloadResponse = await fetch(`${baseUrl}/api/photos/${integrationPhoto.id}/download`);
  assert.equal(albumDownloadResponse.status, 200);
  assert.equal(albumDownloadResponse.headers.get("content-type"), "application/zip");
  assert.match(albumDownloadResponse.headers.get("content-disposition") ?? "", /^attachment;/i);
  const archiveBytes = Buffer.from(await albumDownloadResponse.arrayBuffer());
  assert.equal(archiveBytes.subarray(0, 2).toString("ascii"), "PK");

  const originalGetPhotoAlbumImages = integrationStorage.getPhotoAlbumImages.bind(integrationStorage);
  let concurrentArchiveFetches = 0;
  let completedArchiveFetches = 0;
  let releaseArchiveFetches!: () => void;
  const archiveFetchGate = new Promise<void>(resolve => { releaseArchiveFetches = resolve; });
  integrationStorage.getPhotoAlbumImages = async id => {
    concurrentArchiveFetches += 1;
    await archiveFetchGate;
    const images = await originalGetPhotoAlbumImages(id);
    completedArchiveFetches += 1;
    return images;
  };
  const firstArchiveController = new AbortController();
  const secondArchiveController = new AbortController();
  const firstConcurrentArchive = fetch(`${baseUrl}/api/photos/${integrationPhoto.id}/download`, {
    signal: firstArchiveController.signal,
  }).catch(error => error as Error);
  const secondConcurrentArchive = fetch(`${baseUrl}/api/photos/${integrationPhoto.id}/download`, {
    signal: secondArchiveController.signal,
  }).catch(error => error as Error);
  const rejectedArchiveController = new AbortController();
  try {
    for (let attempt = 0; attempt < 100 && concurrentArchiveFetches < 2; attempt += 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    assert.equal(concurrentArchiveFetches, 2);
    firstArchiveController.abort();
    secondArchiveController.abort();
    const rejectedConcurrentArchive = await Promise.race([
      fetch(`${baseUrl}/api/photos/${integrationPhoto.id}/download`, {
        signal: rejectedArchiveController.signal,
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 250)),
    ]);
    assert.ok(rejectedConcurrentArchive, "Aborted clients must not release archive slots before DB work ends");
    assert.equal(rejectedConcurrentArchive.status, 429);
    assert.equal((await rejectedConcurrentArchive.json() as { code: string }).code, "PHOTO_ARCHIVE_BUSY");
  } finally {
    rejectedArchiveController.abort();
    releaseArchiveFetches();
    integrationStorage.getPhotoAlbumImages = originalGetPhotoAlbumImages;
  }
  const abortedConcurrentArchives = await Promise.all([firstConcurrentArchive, secondConcurrentArchive]);
  assert.ok(abortedConcurrentArchives.every(result => result instanceof Error));
  for (let attempt = 0; attempt < 100 && completedArchiveFetches < 2; attempt += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
  assert.equal(completedArchiveFetches, 2);
  await new Promise<void>(resolve => setTimeout(resolve, 10));
  const archiveAfterRelease = await fetch(`${baseUrl}/api/photos/${integrationPhoto.id}/download`);
  assert.equal(archiveAfterRelease.status, 200);
  await archiveAfterRelease.arrayBuffer();

  assert.equal((await request(
    "DELETE",
    `/api/photo-images/${firstPhotoId}`,
    undefined,
    baseUrl,
    adminCookie,
  )).status, 200);
  const remainingImageId = orderedIds.find(id => id !== firstPhotoId)!;
  const lastPhotoDeleteResponse = await request(
    "DELETE",
    `/api/photo-images/${remainingImageId}`,
    undefined,
    baseUrl,
    adminCookie,
  );
  assert.equal(lastPhotoDeleteResponse.status, 409);
  assert.equal((await lastPhotoDeleteResponse.json() as { code: string }).code, "LAST_PHOTO_IMAGE_BLOCKED");

  const fillPhotoAlbumResponse = await requestForm(
    `/api/photos/${integrationPhoto.id}/images`,
    photoImagesForm(11),
    baseUrl,
    adminCookie,
  );
  assert.equal(fillPhotoAlbumResponse.status, 201);
  assert.equal((await fillPhotoAlbumResponse.json() as { imageCount: number }).imageCount, 12);
  const thirteenthPhotoResponse = await requestForm(
    `/api/photos/${integrationPhoto.id}/images`,
    photoImagesForm(1),
    baseUrl,
    adminCookie,
  );
  assert.equal(thirteenthPhotoResponse.status, 400);
  assert.equal((await thirteenthPhotoResponse.json() as { code: string }).code, "PHOTO_ALBUM_FULL");
  assert.equal((await integrationStorage.getPhotoAlbum(integrationPhoto.id))?.images.length, 12);

  const fullPhotoCreateResponse = await requestForm(
    "/api/photos",
    photoForm("Twelve-photo administrator integration test", 12),
    baseUrl,
    adminCookie,
  );
  assert.equal(fullPhotoCreateResponse.status, 201);
  const fullPhotoAlbum = await fullPhotoCreateResponse.json() as { id: number; imageCount: number };
  integrationFullPhotoAlbumId = fullPhotoAlbum.id;
  assert.equal(fullPhotoAlbum.imageCount, 12);
  assert.equal((await integrationStorage.getPhotoAlbum(fullPhotoAlbum.id))?.images.length, 12);
  assert.equal((await request(
    "DELETE",
    `/api/photos/${fullPhotoAlbum.id}`,
    undefined,
    baseUrl,
    adminCookie,
  )).status, 200);
  integrationFullPhotoAlbumId = null;

  const photoDeleteResponse = await request(
    "DELETE",
    `/api/photos/${integrationPhoto.id}`,
    undefined,
    baseUrl,
    adminCookie,
  );
  assert.equal(photoDeleteResponse.status, 200);
  integrationPhotoAlbumId = null;
  assert.equal((await fetch(`${baseUrl}/api/photo-images/${remainingImageId}`)).status, 404);
} finally {
  if (integrationFullPhotoAlbumId !== null) await integrationStorage.deletePhotoAlbum(integrationFullPhotoAlbumId);
  if (integrationPhotoAlbumId !== null) await integrationStorage.deletePhotoAlbum(integrationPhotoAlbumId);
  if (integrationAdmissionId !== null) await integrationStorage.deleteAdmissionGuideline(integrationAdmissionId);
  if (integrationNoticeId !== null) await integrationStorage.deleteNotice(integrationNoticeId);
  if (integrationPaperId !== null) await integrationStorage.deletePaper(integrationPaperId);
  await integrationStorage.deleteAdmissionGuideline(protectedAdmission.id);
  await integrationStorage.deleteNotice(protectedNotice.id);
  await integrationStorage.deletePaper(protectedPaper.id);
  await new Promise<void>((resolve, reject) => {
    if (!integrationServer.listening) return resolve();
    integrationServer.close(error => error ? reject(error) : resolve());
  });
  console.info = originalConsoleInfo;
  if (integrationNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = integrationNodeEnv;
}

console.log("Security smoke checks passed");
