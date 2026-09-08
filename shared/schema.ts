import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, customType, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("user"),
  status: text("status").notNull().default("active"),
  passwordResetRequired: boolean("password_reset_required").notNull().default(false),
  authVersion: integer("auth_version").notNull().default(1),
  registeredAt: text("registered_at").notNull(),
  registeredTime: text("registered_time").notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  role: true,
  status: true,
  passwordResetRequired: true,
  authVersion: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const admissionGuidelines = pgTable("admission_guidelines", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  organization: text("organization").notNull(),
  date: text("date").notNull(),
  views: integer("views").notNull().default(0),
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
});

export const insertAdmissionGuidelineSchema = createInsertSchema(admissionGuidelines).omit({ id: true });
export type InsertAdmissionGuideline = z.infer<typeof insertAdmissionGuidelineSchema>;
export type AdmissionGuideline = typeof admissionGuidelines.$inferSelect;

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const photoAlbums = pgTable("photo_albums", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  organization: text("organization").notNull(),
  date: text("date").notNull(),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_photo_albums_date").on(table.date, table.id),
]);

export const photoImages = pgTable("photo_images", {
  id: serial("id").primaryKey(),
  albumId: integer("album_id")
    .notNull()
    .references(() => photoAlbums.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  sortOrder: integer("sort_order").notNull(),
  altText: text("alt_text").notNull(),
  data: bytea("image_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_photo_images_album_order").on(table.albumId, table.sortOrder, table.id),
]);

export const photoAlbumsRelations = relations(photoAlbums, ({ many }) => ({
  images: many(photoImages),
}));

export const photoImagesRelations = relations(photoImages, ({ one }) => ({
  album: one(photoAlbums, { fields: [photoImages.albumId], references: [photoAlbums.id] }),
}));

export const insertPhotoAlbumSchema = createInsertSchema(photoAlbums).omit({
  id: true,
  views: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPhotoAlbum = z.infer<typeof insertPhotoAlbumSchema>;
export type PhotoAlbum = typeof photoAlbums.$inferSelect;
export type PhotoImage = typeof photoImages.$inferSelect;

export const notices = pgTable("notices", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  date: text("date").notNull(),
  views: integer("views").notNull().default(0),
  isImportant: boolean("is_important").notNull().default(false),
  files: text("files").array().notNull().default(sql`'{}'::text[]`),
});

export const noticesRelations = relations(notices, ({ many }) => ({
  comments: many(noticeComments),
}));

export const insertNoticeSchema = createInsertSchema(notices).omit({ id: true });
export type InsertNotice = z.infer<typeof insertNoticeSchema>;
export type Notice = typeof notices.$inferSelect;

export const noticeComments = pgTable("notice_comments", {
  id: serial("id").primaryKey(),
  noticeId: integer("notice_id").notNull(),
  userId: integer("user_id"),
  author: text("author").notNull(),
  content: text("content").notNull(),
  date: text("date").notNull(),
});

export const noticeCommentsRelations = relations(noticeComments, ({ one }) => ({
  notice: one(notices, { fields: [noticeComments.noticeId], references: [notices.id] }),
}));

export const insertNoticeCommentSchema = createInsertSchema(noticeComments).omit({ id: true });
export type InsertNoticeComment = z.infer<typeof insertNoticeCommentSchema>;
export type NoticeComment = typeof noticeComments.$inferSelect;

export const papers = pgTable("papers", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().default("conference"),
  title: text("title").notNull(),
  authors: text("authors").notNull(),
  firstAuthor: text("first_author"),
  correspondingAuthor: text("corresponding_author"),
  venue: text("venue"),
  journal: text("journal"),
  volume: text("volume"),
  year: text("year").notNull(),
  abstract: text("abstract"),
  keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
  files: text("files").array().notNull().default(sql`'{}'::text[]`),
  websiteUrl: text("website_url"),
  date: text("date").notNull(),
  views: integer("views").notNull().default(0),
});

export const papersRelations = relations(papers, ({ many }) => ({
  comments: many(paperComments),
  attachments: many(paperAttachments),
}));

export const insertPaperSchema = createInsertSchema(papers).omit({ id: true });
export type InsertPaper = z.infer<typeof insertPaperSchema>;
export type Paper = typeof papers.$inferSelect;

export const paperAttachments = pgTable("paper_attachments", {
  id: serial("id").primaryKey(),
  paperId: integer("paper_id")
    .notNull()
    .references(() => papers.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sortOrder: integer("sort_order").notNull(),
  data: bytea("file_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_paper_attachments_paper_order").on(table.paperId, table.sortOrder, table.id),
]);

export const paperAttachmentsRelations = relations(paperAttachments, ({ one }) => ({
  paper: one(papers, { fields: [paperAttachments.paperId], references: [papers.id] }),
}));

export type PaperAttachment = typeof paperAttachments.$inferSelect;

export const paperComments = pgTable("paper_comments", {
  id: serial("id").primaryKey(),
  paperId: integer("paper_id").notNull(),
  userId: integer("user_id"),
  author: text("author").notNull(),
  content: text("content").notNull(),
  date: text("date").notNull(),
});

export const paperCommentsRelations = relations(paperComments, ({ one }) => ({
  paper: one(papers, { fields: [paperComments.paperId], references: [papers.id] }),
}));

export const insertPaperCommentSchema = createInsertSchema(paperComments).omit({ id: true });
export type InsertPaperComment = z.infer<typeof insertPaperCommentSchema>;
export type PaperComment = typeof paperComments.$inferSelect;

export const talents = pgTable("talents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  education: text("education").notNull(),
  major: text("major").notNull(),
  interestedMajor: text("interested_major").notNull(),
  motivation: text("motivation").notNull(),
  registeredAt: text("registered_at").notNull(),
  registeredTime: text("registered_time").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  retentionUntil: timestamp("retention_until", { withTimezone: true })
    .notNull()
    .default(sql`NOW() + INTERVAL '2 years'`),
});

export const insertTalentSchema = createInsertSchema(talents).omit({ id: true });
export type InsertTalent = z.infer<typeof insertTalentSchema>;
export type Talent = typeof talents.$inferSelect;
