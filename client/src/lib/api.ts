const API_BASE = "/api";

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  registeredAt: string;
  registeredTime: string;
  role: string;
  status: string;
  passwordResetRequired: boolean;
}

export interface AdminAccount {
  id: number;
  username: string;
  name: string;
  role: string;
  status: string;
  passwordResetRequired: boolean;
  registeredAt: string;
  registeredTime: string;
}

export interface AdminBootstrapStatus {
  required: boolean;
  expiresAt: string | null;
}

export interface AdmissionGuideline {
  id: number;
  title: string;
  content: string;
  organization: string;
  date: string;
  views: number;
  attachmentUrl: string | null;
  attachmentName: string | null;
}

export type AdmissionGuidelineInput = Pick<
  AdmissionGuideline,
  "title" | "content" | "organization" | "date" | "attachmentUrl" | "attachmentName"
>;

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: "ADMIN" | "USER";
}

export interface NoticeComment {
  id: number;
  noticeId: number;
  author: string;
  content: string;
  date: string;
  canEdit?: boolean;
}

export interface Notice {
  id: number;
  title: string;
  content: string;
  date: string;
  views: number;
  isImportant: boolean;
  files: string[];
  comments: NoticeComment[];
}

export type NoticeCreateInput = Pick<Notice, "title" | "content" | "date" | "isImportant" | "files">;
export type NoticeUpdateInput = Partial<Omit<NoticeCreateInput, "date">>;

export interface Paper {
  id: number;
  category: string;
  title: string;
  authors: string;
  firstAuthor: string | null;
  correspondingAuthor: string | null;
  venue: string | null;
  journal: string | null;
  volume: string | null;
  year: string;
  abstract: string | null;
  keywords: string[];
  files: string[];
  websiteUrl: string | null;
  date: string;
  views: number;
  attachments?: PaperAttachment[];
}

export interface PaperAttachment {
  id: number;
  paperId: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sortOrder: number;
  createdAt: string;
  downloadUrl?: string;
}

export type PaperCreateInput = Omit<Paper, "id" | "views" | "files" | "attachments">;
export type PaperUpdateInput = Partial<Omit<PaperCreateInput, "date">>;

export interface PhotoImage {
  id: number;
  albumId: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
  altText: string | null;
  url?: string;
  downloadUrl?: string;
}

export interface PhotoAlbum {
  id: number;
  title: string;
  content: string;
  organization: string;
  date: string;
  views: number;
  imageCount: number;
  coverImage: PhotoImage | null;
  images?: PhotoImage[];
  downloadUrl?: string;
}

export type PhotoAlbumInput = Pick<PhotoAlbum, "title" | "content" | "organization" | "date">;

export interface Talent {
  id: number;
  name: string;
  email: string;
  phone: string;
  education: string;
  major: string;
  interestedMajor: string;
  motivation: string;
  registeredAt: string;
  registeredTime: string;
  consentAt?: string;
  retentionUntil?: string;
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    let errorMessage = `서버 오류 (${res.status})`;
    try {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        errorMessage = json.error || json.message || errorMessage;
      } catch {
        if (text) errorMessage = text.substring(0, 200);
      }
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

async function fetchMultipart<T>(url: string, formData: FormData, method: "POST" | "PATCH" | "PUT" = "POST"): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    let errorMessage = `서버 오류 (${res.status})`;
    try {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        errorMessage = json.error || json.message || errorMessage;
      } catch {
        if (text) errorMessage = text.substring(0, 200);
      }
    } catch {
      // 응답 본문을 읽을 수 없는 경우 기본 오류 문구를 사용합니다.
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

function photoFormData(data: Partial<PhotoAlbumInput>, images: File[]) {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) formData.append(key, value);
  });
  images.forEach((file) => formData.append("images", file));
  return formData;
}

function paperFormData(data: PaperCreateInput, attachments: File[]) {
  const formData = new FormData();
  formData.append("paper", JSON.stringify(data));
  attachments.forEach((file) => formData.append("attachments", file));
  return formData;
}

function paperAttachmentsFormData(attachments: File[], fieldName = "attachments") {
  const formData = new FormData();
  attachments.forEach((file) => formData.append(fieldName, file));
  return formData;
}

function paperUpdateFormData(data: PaperUpdateInput & { deleteAttachmentIds: number[] }, attachments: File[]) {
  const formData = new FormData();
  formData.append("paper", JSON.stringify(data));
  attachments.forEach((file) => formData.append("attachments", file));
  return formData;
}

export interface UploadedFile {
  name: string;
  url: string;
  size: number;
  type: string;
}

async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  
  if (!res.ok) {
    let errorMessage = '파일 업로드에 실패했습니다';
    try {
      const json = await res.json();
      errorMessage = json.error || errorMessage;
    } catch (e) {}
    throw new Error(errorMessage);
  }
  
  const data = await res.json();
  return data.files;
}

async function logout(): Promise<void> {
  await fetch(`${API_BASE}/users/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

async function checkSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      credentials: 'include',
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch {
    return null;
  }
}

export const api = {
  uploadFiles,
  logout,
  checkSession,
  users: {
    list: () => fetchApi<User[]>("/users"),
    create: (data: { username: string; password: string; name: string; email: string }) =>
      fetchApi<User>("/users", { method: "POST", body: JSON.stringify(data) }),
    login: async (username: string, password: string) => {
      return fetchApi<SessionUser>("/users/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
    },
    resetPassword: (id: number, password: string) =>
      fetchApi<{ success: boolean }>(`/users/${id}/password`, { method: "PATCH", body: JSON.stringify({ password }) }),
    delete: (id: number) => fetchApi<{ success: boolean }>(`/users/${id}`, { method: "DELETE" }),
  },
  admins: {
    list: () => fetchApi<AdminAccount[]>("/admins"),
    create: (data: { username: string; name: string; password: string }) =>
      fetchApi<AdminAccount>("/admins", { method: "POST", body: JSON.stringify(data) }),
    resetPassword: (id: number, password: string) =>
      fetchApi<{ success: boolean }>(`/admins/${id}/password`, { method: "PATCH", body: JSON.stringify({ password }) }),
    delete: (id: number) => fetchApi<{ success: boolean }>(`/admins/${id}`, { method: "DELETE" }),
  },
  adminBootstrap: {
    status: () => fetchApi<AdminBootstrapStatus>("/admin-bootstrap/status"),
    setup: (data: { setupCode: string; username: string; name: string; password: string }) =>
      fetchApi<AdminAccount>("/admin-bootstrap/setup", { method: "POST", body: JSON.stringify(data) }),
  },
  admissions: {
    list: () => fetchApi<AdmissionGuideline[]>("/admissions"),
    get: (id: number) => fetchApi<AdmissionGuideline>(`/admissions/${id}`),
    create: (data: AdmissionGuidelineInput) =>
      fetchApi<AdmissionGuideline>("/admissions", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<AdmissionGuidelineInput>) =>
      fetchApi<AdmissionGuideline>(`/admissions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => fetchApi<{ success: boolean }>(`/admissions/${id}`, { method: "DELETE" }),
    incrementViews: (id: number) =>
      fetchApi<{ success: boolean; views: number }>(`/admissions/${id}/views`, { method: "PATCH" }),
  },
  notices: {
    list: () => fetchApi<Notice[]>("/notices"),
    get: (id: number) => fetchApi<Notice>(`/notices/${id}`),
    create: (data: NoticeCreateInput) =>
      fetchApi<Notice>("/notices", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: NoticeUpdateInput) =>
      fetchApi<Notice>(`/notices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => fetchApi<{ success: boolean }>(`/notices/${id}`, { method: "DELETE" }),
    incrementViews: (id: number) => fetchApi<{ success: boolean }>(`/notices/${id}/views`, { method: "PATCH" }),
    addComment: (noticeId: number, data: { content: string }) =>
      fetchApi<NoticeComment>(`/notices/${noticeId}/comments`, { method: "POST", body: JSON.stringify(data) }),
    updateComment: (commentId: number, content: string) =>
      fetchApi<NoticeComment>(`/notice-comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ content }) }),
    deleteComment: (commentId: number) =>
      fetchApi<{ success: boolean }>(`/notice-comments/${commentId}`, { method: "DELETE" }),
  },
  papers: {
    list: () => fetchApi<Paper[]>("/papers"),
    get: (id: number) => fetchApi<Paper>(`/papers/${id}`),
    create: (data: PaperCreateInput, attachments: File[] = []) =>
      fetchMultipart<Paper>("/papers", paperFormData(data, attachments)),
    update: (id: number, data: PaperUpdateInput) =>
      fetchApi<Paper>(`/papers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    updateWithAttachments: (
      id: number,
      data: PaperUpdateInput & { deleteAttachmentIds: number[] },
      attachments: File[] = [],
    ) => fetchMultipart<Paper>(`/papers/${id}`, paperUpdateFormData(data, attachments), "PATCH"),
    delete: (id: number) => fetchApi<{ success: boolean }>(`/papers/${id}`, { method: "DELETE" }),
    incrementViews: (id: number) => fetchApi<{ success: boolean }>(`/papers/${id}/views`, { method: "PATCH" }),
    addAttachments: (id: number, attachments: File[]) =>
      fetchMultipart<Paper>(`/papers/${id}/attachments`, paperAttachmentsFormData(attachments)),
    replaceAttachment: (attachmentId: number, attachment: File) =>
      fetchMultipart<PaperAttachment>(
        `/paper-attachments/${attachmentId}`,
        paperAttachmentsFormData([attachment], "attachment"),
        "PUT",
      ),
    deleteAttachment: (attachmentId: number) =>
      fetchApi<{ success: boolean }>(`/paper-attachments/${attachmentId}`, { method: "DELETE" }),
    attachmentDownloadUrl: (attachment: Pick<PaperAttachment, "id" | "downloadUrl">) =>
      attachment.downloadUrl || `${API_BASE}/paper-attachments/${attachment.id}/download`,
  },
  photos: {
    list: () => fetchApi<PhotoAlbum[]>("/photos"),
    get: (id: number) => fetchApi<PhotoAlbum>(`/photos/${id}`),
    create: (data: PhotoAlbumInput, images: File[]) =>
      fetchMultipart<PhotoAlbum>("/photos", photoFormData(data, images)),
    update: (id: number, data: Partial<PhotoAlbumInput>) =>
      fetchApi<PhotoAlbum>(`/photos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    addImages: (id: number, images: File[]) =>
      fetchMultipart<PhotoAlbum>(`/photos/${id}/images`, photoFormData({}, images)),
    reorderImages: (id: number, imageIds: number[]) =>
      fetchApi<PhotoAlbum>(`/photos/${id}/images/order`, { method: "PATCH", body: JSON.stringify({ imageIds }) }),
    deleteImage: (imageId: number) =>
      fetchApi<{ success: boolean }>(`/photo-images/${imageId}`, { method: "DELETE" }),
    delete: (id: number) => fetchApi<{ success: boolean }>(`/photos/${id}`, { method: "DELETE" }),
    incrementViews: (id: number) =>
      fetchApi<{ success: boolean; views: number }>(`/photos/${id}/views`, { method: "PATCH" }),
    imageUrl: (image: Pick<PhotoImage, "id" | "url">) => image.url || `${API_BASE}/photo-images/${image.id}`,
    imageDownloadUrl: (image: Pick<PhotoImage, "id" | "downloadUrl">) =>
      image.downloadUrl || `${API_BASE}/photo-images/${image.id}?download=1`,
    albumDownloadUrl: (album: Pick<PhotoAlbum, "id" | "downloadUrl">) =>
      album.downloadUrl || `${API_BASE}/photos/${album.id}/download`,
  },
  talents: {
    list: () => fetchApi<Talent[]>("/talents"),
    get: (id: number) => fetchApi<Talent>(`/talents/${id}`),
    create: (data: Omit<Talent, "id" | "registeredAt" | "registeredTime" | "consentAt" | "retentionUntil"> & { consent: true }) =>
      fetchApi<{ success: boolean; id: number }>("/talents", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Talent>) =>
      fetchApi<Talent>(`/talents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => fetchApi<{ success: boolean }>(`/talents/${id}`, { method: "DELETE" }),
  },
};
