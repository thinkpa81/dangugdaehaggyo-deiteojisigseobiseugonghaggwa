import {
  users, notices, papers, paperAttachments, talents, noticeComments, paperComments, admissionGuidelines, photoAlbums, photoImages,
  type User, type InsertUser,
  type AdmissionGuideline, type InsertAdmissionGuideline,
  type PhotoAlbum, type InsertPhotoAlbum, type PhotoImage,
  type Notice, type InsertNotice,
  type Paper, type InsertPaper, type PaperAttachment,
  type Talent, type InsertTalent,
  type NoticeComment, type InsertNoticeComment,
  type PaperComment, type InsertPaperComment
} from "@shared/schema";
import { asc, eq, desc, sql } from "drizzle-orm";
import { isPasswordHash } from "./security";

export type CreateAdminInput = {
  username: string;
  password: string;
  name: string;
  registeredAt: string;
  registeredTime: string;
};

export type DeleteAdminResult = "deleted" | "not_found" | "last_admin";
export type AdminSummary = Pick<User,
  "id" | "username" | "name" | "role" | "status" | "passwordResetRequired" | "registeredAt" | "registeredTime"
>;
export type FirstAdminResult =
  | { status: "created"; admin: User }
  | { status: "already_exists" };

export type StoredPhotoImageInput = Pick<PhotoImage,
  "fileName" | "mimeType" | "byteSize" | "width" | "height" | "data"
>;
export type PhotoImageMetadata = Omit<PhotoImage, "data">;
export type PhotoAlbumWithImages = {
  album: PhotoAlbum;
  images: PhotoImageMetadata[];
};
export type AddPhotoImagesResult =
  | { status: "created"; album: PhotoAlbumWithImages }
  | { status: "not_found" }
  | { status: "album_full" }
  | { status: "album_too_large" };
export type ReorderPhotoImagesResult =
  | { status: "updated"; album: PhotoAlbumWithImages }
  | { status: "not_found" }
  | { status: "invalid_order" };
export type DeletePhotoImageResult = "deleted" | "not_found" | "last_image";

export type StoredPaperAttachmentInput = Pick<PaperAttachment,
  "fileName" | "mimeType" | "byteSize" | "data"
>;
export type PaperAttachmentMetadata = Omit<PaperAttachment, "data">;
export type PaperWithAttachments = Paper & {
  attachments: PaperAttachmentMetadata[];
};
export type AddPaperAttachmentsResult =
  | { status: "created"; paper: PaperWithAttachments }
  | { status: "not_found" }
  | { status: "paper_full" }
  | { status: "paper_too_large" };
export type ReplacePaperAttachmentResult =
  | { status: "updated"; attachment: PaperAttachmentMetadata }
  | { status: "not_found" }
  | { status: "paper_too_large" };
export type UpdatePaperWithAttachmentsResult =
  | { status: "updated"; paper: PaperWithAttachments }
  | { status: "not_found" }
  | { status: "attachment_not_found" }
  | { status: "paper_full" }
  | { status: "paper_too_large" };

function photoImageMetadata(image: PhotoImage): PhotoImageMetadata {
  const { data: _data, ...metadata } = image;
  return metadata;
}

function paperAttachmentMetadata(attachment: PaperAttachment): PaperAttachmentMetadata {
  const { data: _data, ...metadata } = attachment;
  return metadata;
}

function isUsableAdmin(user: User): boolean {
  return user.role.toLowerCase() === "admin"
    && user.status === "active"
    && !user.passwordResetRequired
    && isPasswordHash(user.password);
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAdmins(): Promise<AdminSummary[]>;
  createUser(user: InsertUser): Promise<User>;
  createAdmin(user: CreateAdminInput): Promise<User>;
  createFirstAdminSafely(user: CreateAdminInput): Promise<FirstAdminResult>;
  getActiveAdminCount(): Promise<number>;
  deleteAdminSafely(id: number, allowLastDatabaseAdmin: boolean): Promise<DeleteAdminResult>;
  updateUserPassword(id: number, password: string): Promise<void>;
  deleteUser(id: number): Promise<void>;

  getAdmissionGuidelines(): Promise<AdmissionGuideline[]>;
  getAdmissionGuideline(id: number): Promise<AdmissionGuideline | undefined>;
  createAdmissionGuideline(guideline: InsertAdmissionGuideline): Promise<AdmissionGuideline>;
  updateAdmissionGuideline(id: number, guideline: Partial<InsertAdmissionGuideline>): Promise<AdmissionGuideline | undefined>;
  deleteAdmissionGuideline(id: number): Promise<void>;
  incrementAdmissionGuidelineViews(id: number): Promise<number | undefined>;

  getPhotoAlbums(): Promise<PhotoAlbumWithImages[]>;
  getPhotoAlbum(id: number): Promise<PhotoAlbumWithImages | undefined>;
  getPhotoImage(id: number): Promise<PhotoImage | undefined>;
  getPhotoAlbumImages(id: number): Promise<PhotoImage[]>;
  createPhotoAlbum(album: InsertPhotoAlbum, images: StoredPhotoImageInput[]): Promise<PhotoAlbumWithImages>;
  updatePhotoAlbum(id: number, album: Partial<InsertPhotoAlbum>): Promise<PhotoAlbumWithImages | undefined>;
  incrementPhotoAlbumViews(id: number): Promise<number | undefined>;
  addPhotoImages(
    id: number,
    images: StoredPhotoImageInput[],
    maxAlbumBytes: number,
    maxAlbumImages: number,
  ): Promise<AddPhotoImagesResult>;
  reorderPhotoImages(id: number, imageIds: number[]): Promise<ReorderPhotoImagesResult>;
  deletePhotoImageSafely(id: number): Promise<DeletePhotoImageResult>;
  deletePhotoAlbum(id: number): Promise<boolean>;

  getNotices(): Promise<Notice[]>;
  getNotice(id: number): Promise<Notice | undefined>;
  createNotice(notice: InsertNotice): Promise<Notice>;
  updateNotice(id: number, notice: Partial<InsertNotice>): Promise<Notice | undefined>;
  deleteNotice(id: number): Promise<void>;
  incrementNoticeViews(id: number): Promise<void>;

  getNoticeComments(noticeId: number): Promise<NoticeComment[]>;
  getNoticeComment(id: number): Promise<NoticeComment | undefined>;
  createNoticeComment(comment: InsertNoticeComment): Promise<NoticeComment>;
  updateNoticeComment(id: number, content: string): Promise<NoticeComment | undefined>;
  deleteNoticeComment(id: number): Promise<void>;

  getPapers(): Promise<PaperWithAttachments[]>;
  getPaper(id: number): Promise<PaperWithAttachments | undefined>;
  getPaperAttachment(id: number): Promise<PaperAttachment | undefined>;
  createPaper(paper: InsertPaper, attachments?: StoredPaperAttachmentInput[]): Promise<PaperWithAttachments>;
  updatePaper(id: number, paper: Partial<InsertPaper>): Promise<PaperWithAttachments | undefined>;
  updatePaperWithAttachments(
    id: number,
    paper: Partial<InsertPaper>,
    additions: StoredPaperAttachmentInput[],
    deleteAttachmentIds: number[],
    maxPaperBytes: number,
    maxPaperAttachments: number,
  ): Promise<UpdatePaperWithAttachmentsResult>;
  addPaperAttachments(
    id: number,
    attachments: StoredPaperAttachmentInput[],
    maxPaperBytes: number,
    maxPaperAttachments: number,
  ): Promise<AddPaperAttachmentsResult>;
  replacePaperAttachment(
    id: number,
    attachment: StoredPaperAttachmentInput,
    maxPaperBytes: number,
  ): Promise<ReplacePaperAttachmentResult>;
  deletePaperAttachment(id: number): Promise<boolean>;
  deletePaper(id: number): Promise<void>;
  incrementPaperViews(id: number): Promise<void>;

  getPaperComments(paperId: number): Promise<PaperComment[]>;
  getPaperComment(id: number): Promise<PaperComment | undefined>;
  createPaperComment(comment: InsertPaperComment): Promise<PaperComment>;
  updatePaperComment(id: number, content: string): Promise<PaperComment | undefined>;
  deletePaperComment(id: number): Promise<void>;

  getTalents(): Promise<Talent[]>;
  getTalent(id: number): Promise<Talent | undefined>;
  createTalent(talent: InsertTalent): Promise<Talent>;
  updateTalent(id: number, talent: Partial<InsertTalent>): Promise<Talent | undefined>;
  deleteTalent(id: number): Promise<void>;
}

export class MemoryStorage implements IStorage {
  private users: User[] = [];
  private notices: Notice[] = [
    {
      id: 1,
      title: "2025학년도 봄학기 신입생 모집 안내",
      content: "단국대학교 일반대학원 데이터지식서비스공학과에서 2025학년도 봄학기 신입생을 모집합니다.\n\n주요 모집 분야:\n- 데이터사이언스 전공\n- AI/머신러닝 전공\n- 메타버스융합 전공\n\n지원 자격:\n- 학사 학위 소지자 (예정자 포함)\n- 관련 분야 경력자 우대\n\n제출 서류:\n- 입학지원서\n- 학부 성적증명서\n- 자기소개서 및 연구계획서\n\n문의: 데이터지식서비스공학과 행정실 (031-8005-XXXX)",
      date: "2025-01-10",
      views: 156,
      isImportant: true,
      files: []
    },
    {
      id: 2,
      title: "2025년 1월 학위논문 제출 일정 안내",
      content: "2025년 2월 학위수여를 희망하는 석·박사 과정 학생은 아래 일정에 따라 학위논문을 제출해 주시기 바랍니다.\n\n학위논문 제출 일정:\n- 논문 심사 신청: 2025년 1월 5일 ~ 1월 15일\n- 논문 심사: 2025년 1월 20일 ~ 2월 5일\n- 최종 논문 제출: 2025년 2월 10일까지\n- 학위수여식: 2025년 2월 20일\n\n제출 방법:\n- 온라인 제출 시스템 이용\n- 인쇄본 3부 행정실 제출\n\n문의: 학사관리팀",
      date: "2025-01-08",
      views: 89,
      isImportant: true,
      files: []
    },
    {
      id: 3,
      title: "AI/머신러닝 특강 안내 - ChatGPT와 대화형 AI",
      content: "AI 전문가를 초청하여 특강을 개최합니다.\n\n주제: ChatGPT와 대화형 AI의 최신 동향\n강사: 김AI 교수 (서울대학교 AI연구소)\n일시: 2025년 1월 25일 (토) 14:00-16:00\n장소: 단국대학교 산학협력관 301호\n\n참가 신청:\n- 신청 기간: 1월 15일까지\n- 신청 방법: 학과 홈페이지 또는 이메일\n- 정원: 50명 (선착순)\n\n참가비: 무료\n수료증 발급: 참석자 전원",
      date: "2025-01-05",
      views: 124,
      isImportant: false,
      files: []
    },
    {
      id: 4,
      title: "메타버스 프로젝트 발표회 개최",
      content: "메타버스융합 전공 학생들의 학기 프로젝트 발표회를 개최합니다.\n\n일시: 2025년 1월 30일 (목) 13:00-17:00\n장소: 메타버스 연구실 (공학관 5층)\n\n발표 주제:\n- 가상 캠퍼스 구축 프로젝트\n- NFT 기반 디지털 아트 플랫폼\n- VR/AR 교육 콘텐츠 개발\n- 메타버스 전자상거래 시스템\n\n참관 환영: 학부생, 대학원생, 교수님 모두 환영합니다.",
      date: "2025-01-03",
      views: 67,
      isImportant: false,
      files: []
    }
  ];
  private papers: Paper[] = [
    {
      id: 1,
      category: 'international-journal',
      title: "Deep Learning-Based Sentiment Analysis in Metaverse Social Platforms",
      authors: "김철수, 이영희, 박민수",
      firstAuthor: "김철수",
      correspondingAuthor: "박민수",
      venue: null,
      journal: "IEEE Transactions on Computational Social Systems",
      volume: "Vol.11, No.2",
      year: "2024",
      abstract: "This paper presents a novel deep learning approach for sentiment analysis in metaverse social platforms. We propose a multi-modal transformer architecture that processes text, audio, and avatar expressions to accurately predict user emotions in virtual environments.",
      keywords: ["Deep Learning", "Sentiment Analysis", "Metaverse", "Social Computing"],
      files: [],
      websiteUrl: "https://ieeexplore.ieee.org/document/example",
      date: "2024-12-15",
      views: 234
    },
    {
      id: 2,
      category: 'domestic-journal',
      title: "메타버스 환경에서의 사용자 행동 패턴 분석 연구",
      authors: "장순호, 홍길동, 김AI",
      firstAuthor: "장순호",
      correspondingAuthor: "김AI",
      venue: null,
      journal: "한국정보과학회 논문지",
      volume: "제51권 제12호",
      year: "2024",
      abstract: "본 연구는 메타버스 플랫폼에서 사용자들의 행동 패턴을 데이터 마이닝 기법을 통해 분석하였다. 로그 데이터 분석 결과, 사용자들의 가상공간 이동 패턴과 소셜 인터랙션 간 유의미한 상관관계를 발견하였다.",
      keywords: ["메타버스", "사용자 행동 분석", "데이터 마이닝", "소셜 네트워크"],
      files: [],
      websiteUrl: null,
      date: "2024-12-01",
      views: 156
    },
    {
      id: 3,
      category: 'international-conference',
      title: "AI-Powered Recommendation System for Virtual Reality Content",
      authors: "박데이터, 이머신, Smith, J.",
      firstAuthor: "박데이터",
      correspondingAuthor: "Smith, J.",
      venue: "ACM International Conference on Multimedia (ACM MM 2024)",
      journal: null,
      volume: null,
      year: "2024",
      abstract: "We propose an AI-powered recommendation system specifically designed for VR content. Our system uses collaborative filtering combined with deep reinforcement learning to provide personalized content recommendations based on user interaction patterns in 3D environments.",
      keywords: ["VR", "Recommendation System", "Deep Learning", "User Experience"],
      files: [],
      websiteUrl: "https://dl.acm.org/doi/example",
      date: "2024-11-20",
      views: 189
    },
    {
      id: 4,
      category: 'domestic-conference',
      title: "블록체인 기반 메타버스 디지털 자산 거래 시스템",
      authors: "최블록, 강체인, 서메타",
      firstAuthor: "최블록",
      correspondingAuthor: "서메타",
      venue: "한국정보과학회 학술발표논문집",
      journal: null,
      volume: null,
      year: "2024",
      abstract: "메타버스 환경에서 디지털 자산의 안전한 거래를 위한 블록체인 기반 시스템을 제안한다. 스마트 컨트랙트를 활용하여 거래의 투명성과 보안을 보장하며, NFT 기술을 통해 디지털 자산의 소유권을 명확히 한다.",
      keywords: ["블록체인", "메타버스", "NFT", "스마트 컨트랙트", "디지털 자산"],
      files: [],
      websiteUrl: null,
      date: "2024-11-15",
      views: 142
    },
    {
      id: 5,
      category: 'international-journal',
      title: "Federated Learning for Privacy-Preserving Data Analysis in IoT Networks",
      authors: "이프라이버시, Johnson, M., 김보안",
      firstAuthor: "이프라이버시",
      correspondingAuthor: "김보안",
      venue: null,
      journal: "IEEE Internet of Things Journal",
      volume: "Vol.11, No.24",
      year: "2024",
      abstract: "This paper proposes a federated learning framework for privacy-preserving data analysis in IoT networks. Our approach enables collaborative model training across distributed IoT devices without sharing raw data, ensuring user privacy while maintaining model accuracy.",
      keywords: ["Federated Learning", "IoT", "Privacy", "Machine Learning", "Data Security"],
      files: [],
      websiteUrl: "https://ieeexplore.ieee.org/document/iot-example",
      date: "2024-10-30",
      views: 201
    },
    {
      id: 6,
      category: 'domestic-journal',
      title: "자연어 처리 기반 한국어 감성 분석 시스템 개발",
      authors: "정자연어, 한글처리, 감성분석",
      firstAuthor: "정자연어",
      correspondingAuthor: "감성분석",
      venue: null,
      journal: "정보과학회논문지",
      volume: "제50권 제10호",
      year: "2024",
      abstract: "한국어 텍스트의 감성을 정확하게 분석하기 위한 딥러닝 기반 시스템을 개발하였다. BERT 모델을 한국어 데이터로 사전학습하고, 감성 라벨링된 데이터셋으로 파인튜닝하여 기존 방법 대비 15% 향상된 성능을 달성하였다.",
      keywords: ["자연어 처리", "감성 분석", "BERT", "한국어", "딥러닝"],
      files: [],
      websiteUrl: null,
      date: "2024-10-15",
      views: 178
    }
  ];
  private talents: Talent[] = [];
  private noticeComments: NoticeComment[] = [];
  private paperComments: PaperComment[] = [];
  private paperAttachments: PaperAttachment[] = [];
  private admissionGuidelines: AdmissionGuideline[] = [];
  private photoAlbums: PhotoAlbum[] = [];
  private photoImages: PhotoImage[] = [];
  private nextId = {
    users: 1,
    notices: 5,
    papers: 7,
    talents: 1,
    noticeComments: 1,
    paperComments: 1,
    paperAttachments: 1,
    admissionGuidelines: 1,
    photoAlbums: 1,
    photoImages: 1,
  };

  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(u => u.username === username);
  }
  async getAdmins(): Promise<AdminSummary[]> {
    return [...this.users]
      .filter(user => user.role.toLowerCase() === "admin")
      .reverse()
      .map(({ id, username, name, role, status, passwordResetRequired, registeredAt, registeredTime }) => ({
        id, username, name, role, status, passwordResetRequired, registeredAt, registeredTime,
      }));
  }
  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      ...user,
      id: this.nextId.users++,
      email: user.email ?? null,
      role: "user",
      status: "active",
      passwordResetRequired: false,
      authVersion: 1,
    };
    this.users.push(newUser);
    return newUser;
  }
  async createAdmin(user: CreateAdminInput): Promise<User> {
    const admin: User = {
      ...user,
      id: this.nextId.users++,
      email: null,
      role: "admin",
      status: "active",
      passwordResetRequired: false,
      authVersion: 1,
    };
    this.users.push(admin);
    return admin;
  }
  async createFirstAdminSafely(user: CreateAdminInput): Promise<FirstAdminResult> {
    if (this.users.some(isUsableAdmin)) return { status: "already_exists" };
    const existing = this.users.find(candidate => candidate.username === user.username);
    if (existing) {
      Object.assign(existing, user, {
        email: null,
        role: "admin",
        status: "active",
        passwordResetRequired: false,
        authVersion: existing.authVersion + 1,
      });
      return { status: "created", admin: existing };
    }
    return { status: "created", admin: await this.createAdmin(user) };
  }
  async getActiveAdminCount(): Promise<number> {
    return this.users.filter(isUsableAdmin).length;
  }
  async deleteAdminSafely(id: number, allowLastDatabaseAdmin: boolean): Promise<DeleteAdminResult> {
    const admin = this.users.find(user => user.id === id && user.role.toLowerCase() === "admin");
    if (!admin) return "not_found";
    if (isUsableAdmin(admin) && !allowLastDatabaseAdmin && await this.getActiveAdminCount() <= 1) {
      return "last_admin";
    }
    this.users = this.users.filter(user => user.id !== id);
    return "deleted";
  }
  async updateUserPassword(id: number, password: string): Promise<void> {
    const user = this.users.find(u => u.id === id);
    if (user) {
      user.password = password;
      user.passwordResetRequired = false;
      user.authVersion += 1;
    }
  }
  async deleteUser(id: number): Promise<void> {
    this.users = this.users.filter(u => u.id !== id);
  }

  async getAdmissionGuidelines(): Promise<AdmissionGuideline[]> {
    return [...this.admissionGuidelines]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }
  async getAdmissionGuideline(id: number): Promise<AdmissionGuideline | undefined> {
    return this.admissionGuidelines.find(guideline => guideline.id === id);
  }
  async createAdmissionGuideline(guideline: InsertAdmissionGuideline): Promise<AdmissionGuideline> {
    const created: AdmissionGuideline = {
      ...guideline,
      id: this.nextId.admissionGuidelines++,
      views: guideline.views ?? 0,
      attachmentUrl: guideline.attachmentUrl ?? null,
      attachmentName: guideline.attachmentName ?? null,
    };
    this.admissionGuidelines.push(created);
    return created;
  }
  async updateAdmissionGuideline(id: number, guideline: Partial<InsertAdmissionGuideline>): Promise<AdmissionGuideline | undefined> {
    const existing = this.admissionGuidelines.find(item => item.id === id);
    if (existing) Object.assign(existing, guideline);
    return existing;
  }
  async deleteAdmissionGuideline(id: number): Promise<void> {
    this.admissionGuidelines = this.admissionGuidelines.filter(item => item.id !== id);
  }
  async incrementAdmissionGuidelineViews(id: number): Promise<number | undefined> {
    const guideline = this.admissionGuidelines.find(item => item.id === id);
    if (!guideline) return undefined;
    guideline.views += 1;
    return guideline.views;
  }

  private photoAlbumWithImages(album: PhotoAlbum): PhotoAlbumWithImages {
    return {
      album: { ...album },
      images: this.photoImages
        .filter(image => image.albumId === album.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map(photoImageMetadata),
    };
  }

  private resequencePhotoImages(album: PhotoAlbum, orderedImages: PhotoImage[]): void {
    orderedImages.forEach((image, index) => {
      image.sortOrder = index;
      image.altText = `${album.title} 사진 ${index + 1}`;
    });
  }

  async getPhotoAlbums(): Promise<PhotoAlbumWithImages[]> {
    return [...this.photoAlbums]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map(album => this.photoAlbumWithImages(album));
  }

  async getPhotoAlbum(id: number): Promise<PhotoAlbumWithImages | undefined> {
    const album = this.photoAlbums.find(item => item.id === id);
    return album ? this.photoAlbumWithImages(album) : undefined;
  }

  async getPhotoImage(id: number): Promise<PhotoImage | undefined> {
    const image = this.photoImages.find(item => item.id === id);
    return image ? { ...image, data: Buffer.from(image.data) } : undefined;
  }

  async getPhotoAlbumImages(id: number): Promise<PhotoImage[]> {
    return this.photoImages
      .filter(image => image.albumId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map(image => ({ ...image, data: Buffer.from(image.data) }));
  }

  async createPhotoAlbum(album: InsertPhotoAlbum, images: StoredPhotoImageInput[]): Promise<PhotoAlbumWithImages> {
    const now = new Date();
    const created: PhotoAlbum = {
      ...album,
      id: this.nextId.photoAlbums++,
      views: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.photoAlbums.push(created);
    images.forEach((image, index) => {
      this.photoImages.push({
        ...image,
        data: Buffer.from(image.data),
        id: this.nextId.photoImages++,
        albumId: created.id,
        sortOrder: index,
        altText: `${created.title} 사진 ${index + 1}`,
        createdAt: now,
      });
    });
    return this.photoAlbumWithImages(created);
  }

  async updatePhotoAlbum(id: number, album: Partial<InsertPhotoAlbum>): Promise<PhotoAlbumWithImages | undefined> {
    const existing = this.photoAlbums.find(item => item.id === id);
    if (!existing) return undefined;
    Object.assign(existing, album, { updatedAt: new Date() });
    if (album.title) {
      const ordered = this.photoImages
        .filter(image => image.albumId === id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      this.resequencePhotoImages(existing, ordered);
    }
    return this.photoAlbumWithImages(existing);
  }

  async incrementPhotoAlbumViews(id: number): Promise<number | undefined> {
    const album = this.photoAlbums.find(item => item.id === id);
    if (!album) return undefined;
    album.views += 1;
    return album.views;
  }

  async addPhotoImages(
    id: number,
    images: StoredPhotoImageInput[],
    maxAlbumBytes: number,
    maxAlbumImages: number,
  ): Promise<AddPhotoImagesResult> {
    const album = this.photoAlbums.find(item => item.id === id);
    if (!album) return { status: "not_found" };
    const existing = this.photoImages
      .filter(image => image.albumId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    if (existing.length + images.length > maxAlbumImages) return { status: "album_full" };
    const totalBytes = existing.reduce((sum, image) => sum + image.byteSize, 0)
      + images.reduce((sum, image) => sum + image.byteSize, 0);
    if (totalBytes > maxAlbumBytes) return { status: "album_too_large" };

    const now = new Date();
    images.forEach((image, index) => {
      this.photoImages.push({
        ...image,
        data: Buffer.from(image.data),
        id: this.nextId.photoImages++,
        albumId: id,
        sortOrder: existing.length + index,
        altText: `${album.title} 사진 ${existing.length + index + 1}`,
        createdAt: now,
      });
    });
    album.updatedAt = now;
    return { status: "created", album: this.photoAlbumWithImages(album) };
  }

  async reorderPhotoImages(id: number, imageIds: number[]): Promise<ReorderPhotoImagesResult> {
    const album = this.photoAlbums.find(item => item.id === id);
    if (!album) return { status: "not_found" };
    const existing = this.photoImages.filter(image => image.albumId === id);
    const uniqueIds = new Set(imageIds);
    if (uniqueIds.size !== imageIds.length
      || imageIds.length !== existing.length
      || existing.some(image => !uniqueIds.has(image.id))) {
      return { status: "invalid_order" };
    }
    const byId = new Map(existing.map(image => [image.id, image]));
    const ordered = imageIds.map(imageId => byId.get(imageId)!);
    this.resequencePhotoImages(album, ordered);
    album.updatedAt = new Date();
    return { status: "updated", album: this.photoAlbumWithImages(album) };
  }

  async deletePhotoImageSafely(id: number): Promise<DeletePhotoImageResult> {
    const image = this.photoImages.find(item => item.id === id);
    if (!image) return "not_found";
    const album = this.photoAlbums.find(item => item.id === image.albumId);
    if (!album) return "not_found";
    const albumImages = this.photoImages
      .filter(item => item.albumId === image.albumId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    if (albumImages.length <= 1) return "last_image";
    this.photoImages = this.photoImages.filter(item => item.id !== id);
    this.resequencePhotoImages(album, albumImages.filter(item => item.id !== id));
    album.updatedAt = new Date();
    return "deleted";
  }

  async deletePhotoAlbum(id: number): Promise<boolean> {
    const exists = this.photoAlbums.some(album => album.id === id);
    if (!exists) return false;
    this.photoAlbums = this.photoAlbums.filter(album => album.id !== id);
    this.photoImages = this.photoImages.filter(image => image.albumId !== id);
    return true;
  }

  async getNotices(): Promise<Notice[]> {
    return [...this.notices].reverse();
  }
  async getNotice(id: number): Promise<Notice | undefined> {
    return this.notices.find(n => n.id === id);
  }
  async createNotice(notice: InsertNotice): Promise<Notice> {
    const newNotice: Notice = { 
      id: this.nextId.notices++,
      title: notice.title,
      content: notice.content,
      date: notice.date,
      views: notice.views ?? 0,
      isImportant: notice.isImportant ?? false,
      files: notice.files ?? []
    };
    this.notices.push(newNotice);
    return newNotice;
  }
  async updateNotice(id: number, notice: Partial<InsertNotice>): Promise<Notice | undefined> {
    const existing = this.notices.find(n => n.id === id);
    if (existing) Object.assign(existing, notice);
    return existing;
  }
  async deleteNotice(id: number): Promise<void> {
    this.notices = this.notices.filter(n => n.id !== id);
    this.noticeComments = this.noticeComments.filter(c => c.noticeId !== id);
  }
  async incrementNoticeViews(id: number): Promise<void> {
    const notice = this.notices.find(n => n.id === id);
    if (notice) notice.views++;
  }

  async getNoticeComments(noticeId: number): Promise<NoticeComment[]> {
    return this.noticeComments.filter(c => c.noticeId === noticeId).reverse();
  }
  async getNoticeComment(id: number): Promise<NoticeComment | undefined> {
    return this.noticeComments.find(c => c.id === id);
  }
  async createNoticeComment(comment: InsertNoticeComment): Promise<NoticeComment> {
    const newComment: NoticeComment = {
      ...comment,
      id: this.nextId.noticeComments++,
      userId: comment.userId ?? null,
    };
    this.noticeComments.push(newComment);
    return newComment;
  }
  async updateNoticeComment(id: number, content: string): Promise<NoticeComment | undefined> {
    const comment = this.noticeComments.find(c => c.id === id);
    if (comment) comment.content = content;
    return comment;
  }
  async deleteNoticeComment(id: number): Promise<void> {
    this.noticeComments = this.noticeComments.filter(c => c.id !== id);
  }

  private paperWithAttachments(paper: Paper): PaperWithAttachments {
    return {
      ...paper,
      attachments: this.paperAttachments
        .filter(attachment => attachment.paperId === paper.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map(paperAttachmentMetadata),
    };
  }

  async getPapers(): Promise<PaperWithAttachments[]> {
    return [...this.papers].reverse().map(paper => this.paperWithAttachments(paper));
  }
  async getPaper(id: number): Promise<PaperWithAttachments | undefined> {
    const paper = this.papers.find(candidate => candidate.id === id);
    return paper ? this.paperWithAttachments(paper) : undefined;
  }
  async getPaperAttachment(id: number): Promise<PaperAttachment | undefined> {
    return this.paperAttachments.find(attachment => attachment.id === id);
  }
  async createPaper(
    paper: InsertPaper,
    attachments: StoredPaperAttachmentInput[] = [],
  ): Promise<PaperWithAttachments> {
    const newPaper: Paper = { 
      id: this.nextId.papers++,
      category: paper.category ?? 'conference',
      title: paper.title,
      authors: paper.authors,
      firstAuthor: paper.firstAuthor ?? null,
      correspondingAuthor: paper.correspondingAuthor ?? null,
      venue: paper.venue ?? null,
      journal: paper.journal ?? null,
      volume: paper.volume ?? null,
      year: paper.year,
      abstract: paper.abstract ?? null,
      keywords: paper.keywords ?? [],
      files: paper.files ?? [],
      websiteUrl: paper.websiteUrl ?? null,
      date: paper.date,
      views: paper.views ?? 0
    };
    this.papers.push(newPaper);
    attachments.forEach((attachment, index) => {
      this.paperAttachments.push({
        ...attachment,
        id: this.nextId.paperAttachments++,
        paperId: newPaper.id,
        sortOrder: index,
        createdAt: new Date(),
      });
    });
    return this.paperWithAttachments(newPaper);
  }
  async updatePaper(id: number, paper: Partial<InsertPaper>): Promise<PaperWithAttachments | undefined> {
    const existing = this.papers.find(p => p.id === id);
    if (existing) Object.assign(existing, paper);
    return existing ? this.paperWithAttachments(existing) : undefined;
  }
  async updatePaperWithAttachments(
    id: number,
    paper: Partial<InsertPaper>,
    additions: StoredPaperAttachmentInput[],
    deleteAttachmentIds: number[],
    maxPaperBytes: number,
    maxPaperAttachments: number,
  ): Promise<UpdatePaperWithAttachmentsResult> {
    const existingPaper = this.papers.find(candidate => candidate.id === id);
    if (!existingPaper) return { status: "not_found" };
    const current = this.paperAttachments.filter(attachment => attachment.paperId === id);
    const requestedIds = new Set(deleteAttachmentIds);
    if (requestedIds.size !== deleteAttachmentIds.length
      || deleteAttachmentIds.some(attachmentId => !current.some(item => item.id === attachmentId))) {
      return { status: "attachment_not_found" };
    }
    const remaining = current.filter(attachment => !requestedIds.has(attachment.id));
    if (remaining.length + additions.length > maxPaperAttachments) return { status: "paper_full" };
    const totalBytes = remaining.reduce((sum, attachment) => sum + attachment.byteSize, 0)
      + additions.reduce((sum, attachment) => sum + attachment.byteSize, 0);
    if (totalBytes > maxPaperBytes) return { status: "paper_too_large" };

    Object.assign(existingPaper, paper);
    this.paperAttachments = this.paperAttachments.filter(attachment => !requestedIds.has(attachment.id));
    remaining
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .forEach((attachment, index) => { attachment.sortOrder = index; });
    additions.forEach((attachment, index) => {
      this.paperAttachments.push({
        ...attachment,
        id: this.nextId.paperAttachments++,
        paperId: id,
        sortOrder: remaining.length + index,
        createdAt: new Date(),
      });
    });
    return { status: "updated", paper: this.paperWithAttachments(existingPaper) };
  }
  async addPaperAttachments(
    id: number,
    attachments: StoredPaperAttachmentInput[],
    maxPaperBytes: number,
    maxPaperAttachments: number,
  ): Promise<AddPaperAttachmentsResult> {
    const paper = this.papers.find(candidate => candidate.id === id);
    if (!paper) return { status: "not_found" };
    const existing = this.paperAttachments.filter(attachment => attachment.paperId === id);
    if (existing.length + attachments.length > maxPaperAttachments) return { status: "paper_full" };
    const totalBytes = existing.reduce((sum, attachment) => sum + attachment.byteSize, 0)
      + attachments.reduce((sum, attachment) => sum + attachment.byteSize, 0);
    if (totalBytes > maxPaperBytes) return { status: "paper_too_large" };
    attachments.forEach((attachment, index) => {
      this.paperAttachments.push({
        ...attachment,
        id: this.nextId.paperAttachments++,
        paperId: id,
        sortOrder: existing.length + index,
        createdAt: new Date(),
      });
    });
    return { status: "created", paper: this.paperWithAttachments(paper) };
  }
  async replacePaperAttachment(
    id: number,
    attachment: StoredPaperAttachmentInput,
    maxPaperBytes: number,
  ): Promise<ReplacePaperAttachmentResult> {
    const existing = this.paperAttachments.find(candidate => candidate.id === id);
    if (!existing) return { status: "not_found" };
    const totalBytes = this.paperAttachments
      .filter(candidate => candidate.paperId === existing.paperId && candidate.id !== id)
      .reduce((sum, candidate) => sum + candidate.byteSize, 0) + attachment.byteSize;
    if (totalBytes > maxPaperBytes) return { status: "paper_too_large" };
    Object.assign(existing, attachment, { createdAt: new Date() });
    return { status: "updated", attachment: paperAttachmentMetadata(existing) };
  }
  async deletePaperAttachment(id: number): Promise<boolean> {
    const candidate = this.paperAttachments.find(attachment => attachment.id === id);
    if (!candidate) return false;
    this.paperAttachments = this.paperAttachments.filter(attachment => attachment.id !== id);
    const remaining = this.paperAttachments
      .filter(attachment => attachment.paperId === candidate.paperId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    remaining.forEach((attachment, index) => { attachment.sortOrder = index; });
    return true;
  }
  async deletePaper(id: number): Promise<void> {
    this.papers = this.papers.filter(p => p.id !== id);
    this.paperComments = this.paperComments.filter(c => c.paperId !== id);
    this.paperAttachments = this.paperAttachments.filter(attachment => attachment.paperId !== id);
  }
  async incrementPaperViews(id: number): Promise<void> {
    const paper = this.papers.find(p => p.id === id);
    if (paper) paper.views++;
  }

  async getPaperComments(paperId: number): Promise<PaperComment[]> {
    return this.paperComments.filter(c => c.paperId === paperId).reverse();
  }
  async getPaperComment(id: number): Promise<PaperComment | undefined> {
    return this.paperComments.find(c => c.id === id);
  }
  async createPaperComment(comment: InsertPaperComment): Promise<PaperComment> {
    const newComment: PaperComment = {
      ...comment,
      id: this.nextId.paperComments++,
      userId: comment.userId ?? null,
    };
    this.paperComments.push(newComment);
    return newComment;
  }
  async updatePaperComment(id: number, content: string): Promise<PaperComment | undefined> {
    const comment = this.paperComments.find(c => c.id === id);
    if (comment) comment.content = content;
    return comment;
  }
  async deletePaperComment(id: number): Promise<void> {
    this.paperComments = this.paperComments.filter(c => c.id !== id);
  }

  async getTalents(): Promise<Talent[]> {
    return [...this.talents].reverse();
  }
  async getTalent(id: number): Promise<Talent | undefined> {
    return this.talents.find(t => t.id === id);
  }
  async createTalent(talent: InsertTalent): Promise<Talent> {
    const consentAt = talent.consentAt ?? new Date();
    const retentionUntil = talent.retentionUntil ?? new Date(consentAt);
    if (!talent.retentionUntil) retentionUntil.setUTCFullYear(retentionUntil.getUTCFullYear() + 2);
    const newTalent: Talent = {
      ...talent,
      id: this.nextId.talents++,
      consentAt,
      retentionUntil,
    };
    this.talents.push(newTalent);
    return newTalent;
  }
  async updateTalent(id: number, talent: Partial<InsertTalent>): Promise<Talent | undefined> {
    const existing = this.talents.find(t => t.id === id);
    if (existing) Object.assign(existing, talent);
    return existing;
  }
  async deleteTalent(id: number): Promise<void> {
    this.talents = this.talents.filter(t => t.id !== id);
  }
}

export class DatabaseStorage implements IStorage {
  private db: any;
  
  constructor(db: any) {
    this.db = db;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getAdmins(): Promise<AdminSummary[]> {
    return await this.db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        role: users.role,
        status: users.status,
        passwordResetRequired: users.passwordResetRequired,
        registeredAt: users.registeredAt,
        registeredTime: users.registeredTime,
      })
      .from(users)
      .where(sql`lower(${users.role}) = 'admin'`)
      .orderBy(desc(users.id));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await this.db.insert(users).values(insertUser).returning();
    return user;
  }

  async createAdmin(admin: CreateAdminInput): Promise<User> {
    const [created] = await this.db.insert(users).values({
      ...admin,
      email: null,
      role: "admin",
      status: "active",
      passwordResetRequired: false,
      authVersion: 1,
    }).returning();
    return created;
  }

  async createFirstAdminSafely(admin: CreateAdminInput): Promise<FirstAdminResult> {
    return await this.db.transaction(async (transaction: any) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(814207331)`);
      const candidates = await transaction
        .select()
        .from(users)
        .where(sql`
          lower(${users.role}) = 'admin'
          AND ${users.status} = 'active'
          AND ${users.passwordResetRequired} = false
        `);
      if (candidates.some((candidate: User) => isPasswordHash(candidate.password))) {
        return { status: "already_exists" };
      }

      const [existing] = await transaction
        .select()
        .from(users)
        .where(eq(users.username, admin.username));
      if (existing) {
        const [restored] = await transaction
          .update(users)
          .set({
            password: admin.password,
            name: admin.name,
            email: null,
            role: "admin",
            status: "active",
            passwordResetRequired: false,
            authVersion: sql`${users.authVersion} + 1`,
            registeredAt: admin.registeredAt,
            registeredTime: admin.registeredTime,
          })
          .where(eq(users.id, existing.id))
          .returning();
        return { status: "created", admin: restored };
      }

      const [created] = await transaction.insert(users).values({
        ...admin,
        email: null,
        role: "admin",
        status: "active",
        passwordResetRequired: false,
        authVersion: 1,
      }).returning();
      return { status: "created", admin: created };
    });
  }

  async getActiveAdminCount(): Promise<number> {
    const candidates = await this.db
      .select()
      .from(users)
      .where(sql`
        lower(${users.role}) = 'admin'
        AND ${users.status} = 'active'
        AND ${users.passwordResetRequired} = false
      `);
    return candidates.filter((candidate: User) => isPasswordHash(candidate.password)).length;
  }

  async deleteAdminSafely(id: number, allowLastDatabaseAdmin: boolean): Promise<DeleteAdminResult> {
    return await this.db.transaction(async (transaction: any) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(814207331)`);
      const [admin] = await transaction
        .select()
        .from(users)
        .where(sql`${users.id} = ${id} AND lower(${users.role}) = 'admin'`);
      if (!admin) return "not_found";

      const targetIsUsable = admin.status === "active"
        && !admin.passwordResetRequired
        && isPasswordHash(admin.password);
      if (targetIsUsable && !allowLastDatabaseAdmin) {
        const candidates = await transaction
          .select()
          .from(users)
          .where(sql`
            lower(${users.role}) = 'admin'
            AND ${users.status} = 'active'
            AND ${users.passwordResetRequired} = false
          `);
        if (candidates.filter((candidate: User) => isPasswordHash(candidate.password)).length <= 1) return "last_admin";
      }

      await transaction.delete(users).where(eq(users.id, id));
      return "deleted";
    });
  }

  async updateUserPassword(id: number, password: string): Promise<void> {
    await this.db
      .update(users)
      .set({ password, passwordResetRequired: false, authVersion: sql`${users.authVersion} + 1` })
      .where(eq(users.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }

  async getAdmissionGuidelines(): Promise<AdmissionGuideline[]> {
    return await this.db.select().from(admissionGuidelines).orderBy(desc(admissionGuidelines.date), desc(admissionGuidelines.id));
  }

  async getAdmissionGuideline(id: number): Promise<AdmissionGuideline | undefined> {
    const [guideline] = await this.db.select().from(admissionGuidelines).where(eq(admissionGuidelines.id, id));
    return guideline || undefined;
  }

  async createAdmissionGuideline(guideline: InsertAdmissionGuideline): Promise<AdmissionGuideline> {
    const [created] = await this.db.insert(admissionGuidelines).values(guideline).returning();
    return created;
  }

  async updateAdmissionGuideline(id: number, guideline: Partial<InsertAdmissionGuideline>): Promise<AdmissionGuideline | undefined> {
    const [updated] = await this.db.update(admissionGuidelines).set(guideline).where(eq(admissionGuidelines.id, id)).returning();
    return updated || undefined;
  }

  async deleteAdmissionGuideline(id: number): Promise<void> {
    await this.db.delete(admissionGuidelines).where(eq(admissionGuidelines.id, id));
  }

  async incrementAdmissionGuidelineViews(id: number): Promise<number | undefined> {
    const [updated] = await this.db
      .update(admissionGuidelines)
      .set({ views: sql`${admissionGuidelines.views} + 1` })
      .where(eq(admissionGuidelines.id, id))
      .returning({ views: admissionGuidelines.views });
    return updated?.views;
  }

  private async getPhotoImageMetadataForAlbum(executor: any, albumId: number): Promise<PhotoImageMetadata[]> {
    return await executor
      .select({
        id: photoImages.id,
        albumId: photoImages.albumId,
        fileName: photoImages.fileName,
        mimeType: photoImages.mimeType,
        byteSize: photoImages.byteSize,
        width: photoImages.width,
        height: photoImages.height,
        sortOrder: photoImages.sortOrder,
        altText: photoImages.altText,
        createdAt: photoImages.createdAt,
      })
      .from(photoImages)
      .where(eq(photoImages.albumId, albumId))
      .orderBy(asc(photoImages.sortOrder), asc(photoImages.id));
  }

  private async getPhotoAlbumWithImages(executor: any, id: number): Promise<PhotoAlbumWithImages | undefined> {
    const [album] = await executor.select().from(photoAlbums).where(eq(photoAlbums.id, id));
    if (!album) return undefined;
    return {
      album,
      images: await this.getPhotoImageMetadataForAlbum(executor, id),
    };
  }

  async getPhotoAlbums(): Promise<PhotoAlbumWithImages[]> {
    const albums = await this.db
      .select()
      .from(photoAlbums)
      .orderBy(desc(photoAlbums.date), desc(photoAlbums.id));
    if (!albums.length) return [];

    const metadata = await this.db
      .select({
        id: photoImages.id,
        albumId: photoImages.albumId,
        fileName: photoImages.fileName,
        mimeType: photoImages.mimeType,
        byteSize: photoImages.byteSize,
        width: photoImages.width,
        height: photoImages.height,
        sortOrder: photoImages.sortOrder,
        altText: photoImages.altText,
        createdAt: photoImages.createdAt,
      })
      .from(photoImages)
      .orderBy(asc(photoImages.albumId), asc(photoImages.sortOrder), asc(photoImages.id));
    const imagesByAlbum = new Map<number, PhotoImageMetadata[]>();
    metadata.forEach((image: PhotoImageMetadata) => {
      const images = imagesByAlbum.get(image.albumId) ?? [];
      images.push(image);
      imagesByAlbum.set(image.albumId, images);
    });
    return albums.map((album: PhotoAlbum) => ({
      album,
      images: imagesByAlbum.get(album.id) ?? [],
    }));
  }

  async getPhotoAlbum(id: number): Promise<PhotoAlbumWithImages | undefined> {
    return await this.getPhotoAlbumWithImages(this.db, id);
  }

  async getPhotoImage(id: number): Promise<PhotoImage | undefined> {
    const [image] = await this.db.select().from(photoImages).where(eq(photoImages.id, id));
    return image || undefined;
  }

  async getPhotoAlbumImages(id: number): Promise<PhotoImage[]> {
    return await this.db
      .select()
      .from(photoImages)
      .where(eq(photoImages.albumId, id))
      .orderBy(asc(photoImages.sortOrder), asc(photoImages.id));
  }

  async createPhotoAlbum(album: InsertPhotoAlbum, images: StoredPhotoImageInput[]): Promise<PhotoAlbumWithImages> {
    return await this.db.transaction(async (transaction: any) => {
      const [created] = await transaction
        .insert(photoAlbums)
        .values({ ...album, views: 0 })
        .returning();
      if (images.length) {
        await transaction.insert(photoImages).values(images.map((image, index) => ({
          ...image,
          albumId: created.id,
          sortOrder: index,
          altText: `${created.title} 사진 ${index + 1}`,
        })));
      }
      return (await this.getPhotoAlbumWithImages(transaction, created.id))!;
    });
  }

  async updatePhotoAlbum(id: number, album: Partial<InsertPhotoAlbum>): Promise<PhotoAlbumWithImages | undefined> {
    return await this.db.transaction(async (transaction: any) => {
      await transaction.execute(sql`SELECT id FROM photo_albums WHERE id = ${id} FOR UPDATE`);
      const [updated] = await transaction
        .update(photoAlbums)
        .set({ ...album, updatedAt: new Date() })
        .where(eq(photoAlbums.id, id))
        .returning();
      if (!updated) return undefined;

      if (album.title !== undefined) {
        const images = await this.getPhotoImageMetadataForAlbum(transaction, id);
        for (let index = 0; index < images.length; index += 1) {
          const image = images[index];
          await transaction
            .update(photoImages)
            .set({ altText: `${updated.title} 사진 ${index + 1}` })
            .where(eq(photoImages.id, image.id));
        }
      }
      return (await this.getPhotoAlbumWithImages(transaction, id))!;
    });
  }

  async incrementPhotoAlbumViews(id: number): Promise<number | undefined> {
    const [updated] = await this.db
      .update(photoAlbums)
      .set({ views: sql`${photoAlbums.views} + 1` })
      .where(eq(photoAlbums.id, id))
      .returning({ views: photoAlbums.views });
    return updated?.views;
  }

  async addPhotoImages(
    id: number,
    images: StoredPhotoImageInput[],
    maxAlbumBytes: number,
    maxAlbumImages: number,
  ): Promise<AddPhotoImagesResult> {
    return await this.db.transaction(async (transaction: any) => {
      await transaction.execute(sql`SELECT id FROM photo_albums WHERE id = ${id} FOR UPDATE`);
      const [album] = await transaction.select().from(photoAlbums).where(eq(photoAlbums.id, id));
      if (!album) return { status: "not_found" } as const;

      const existing = await this.getPhotoImageMetadataForAlbum(transaction, id);
      if (existing.length + images.length > maxAlbumImages) return { status: "album_full" } as const;
      const totalBytes = existing.reduce((sum, image) => sum + image.byteSize, 0)
        + images.reduce((sum, image) => sum + image.byteSize, 0);
      if (totalBytes > maxAlbumBytes) return { status: "album_too_large" } as const;

      if (images.length) {
        await transaction.insert(photoImages).values(images.map((image, index) => ({
          ...image,
          albumId: id,
          sortOrder: existing.length + index,
          altText: `${album.title} 사진 ${existing.length + index + 1}`,
        })));
      }
      await transaction
        .update(photoAlbums)
        .set({ updatedAt: new Date() })
        .where(eq(photoAlbums.id, id));
      return {
        status: "created",
        album: (await this.getPhotoAlbumWithImages(transaction, id))!,
      } as const;
    });
  }

  async reorderPhotoImages(id: number, imageIds: number[]): Promise<ReorderPhotoImagesResult> {
    return await this.db.transaction(async (transaction: any) => {
      await transaction.execute(sql`SELECT id FROM photo_albums WHERE id = ${id} FOR UPDATE`);
      const [album] = await transaction.select().from(photoAlbums).where(eq(photoAlbums.id, id));
      if (!album) return { status: "not_found" } as const;

      const existing = await this.getPhotoImageMetadataForAlbum(transaction, id);
      const requestedIds = new Set(imageIds);
      if (requestedIds.size !== imageIds.length
        || imageIds.length !== existing.length
        || existing.some(image => !requestedIds.has(image.id))) {
        return { status: "invalid_order" } as const;
      }

      await transaction
        .update(photoImages)
        .set({ sortOrder: sql`${photoImages.sortOrder} + 1000000` })
        .where(eq(photoImages.albumId, id));
      for (let index = 0; index < imageIds.length; index += 1) {
        const imageId = imageIds[index];
        await transaction
          .update(photoImages)
          .set({ sortOrder: index, altText: `${album.title} 사진 ${index + 1}` })
          .where(eq(photoImages.id, imageId));
      }
      await transaction
        .update(photoAlbums)
        .set({ updatedAt: new Date() })
        .where(eq(photoAlbums.id, id));
      return {
        status: "updated",
        album: (await this.getPhotoAlbumWithImages(transaction, id))!,
      } as const;
    });
  }

  async deletePhotoImageSafely(id: number): Promise<DeletePhotoImageResult> {
    return await this.db.transaction(async (transaction: any) => {
      const [candidate] = await transaction.select().from(photoImages).where(eq(photoImages.id, id));
      if (!candidate) return "not_found";

      await transaction.execute(sql`SELECT id FROM photo_albums WHERE id = ${candidate.albumId} FOR UPDATE`);
      const [album] = await transaction.select().from(photoAlbums).where(eq(photoAlbums.id, candidate.albumId));
      if (!album) return "not_found";
      const existing = await this.getPhotoImageMetadataForAlbum(transaction, album.id);
      if (existing.length <= 1) return "last_image";

      const [deleted] = await transaction
        .delete(photoImages)
        .where(eq(photoImages.id, id))
        .returning({ id: photoImages.id });
      if (!deleted) return "not_found";

      const remaining = existing.filter(image => image.id !== id);
      for (let index = 0; index < remaining.length; index += 1) {
        const image = remaining[index];
        await transaction
          .update(photoImages)
          .set({ sortOrder: index, altText: `${album.title} 사진 ${index + 1}` })
          .where(eq(photoImages.id, image.id));
      }
      await transaction
        .update(photoAlbums)
        .set({ updatedAt: new Date() })
        .where(eq(photoAlbums.id, album.id));
      return "deleted";
    });
  }

  async deletePhotoAlbum(id: number): Promise<boolean> {
    const [deleted] = await this.db
      .delete(photoAlbums)
      .where(eq(photoAlbums.id, id))
      .returning({ id: photoAlbums.id });
    return Boolean(deleted);
  }

  async getNotices(): Promise<Notice[]> {
    return await this.db.select().from(notices).orderBy(desc(notices.id));
  }

  async getNotice(id: number): Promise<Notice | undefined> {
    const [notice] = await this.db.select().from(notices).where(eq(notices.id, id));
    return notice || undefined;
  }

  async createNotice(notice: InsertNotice): Promise<Notice> {
    const [created] = await this.db.insert(notices).values(notice).returning();
    return created;
  }

  async updateNotice(id: number, notice: Partial<InsertNotice>): Promise<Notice | undefined> {
    const [updated] = await this.db.update(notices).set(notice).where(eq(notices.id, id)).returning();
    return updated || undefined;
  }

  async deleteNotice(id: number): Promise<void> {
    await this.db.delete(noticeComments).where(eq(noticeComments.noticeId, id));
    await this.db.delete(notices).where(eq(notices.id, id));
  }

  async incrementNoticeViews(id: number): Promise<void> {
    await this.db
      .update(notices)
      .set({ views: sql`${notices.views} + 1` })
      .where(eq(notices.id, id));
  }

  async getNoticeComments(noticeId: number): Promise<NoticeComment[]> {
    return await this.db.select().from(noticeComments).where(eq(noticeComments.noticeId, noticeId)).orderBy(desc(noticeComments.id));
  }

  async getNoticeComment(id: number): Promise<NoticeComment | undefined> {
    const [comment] = await this.db.select().from(noticeComments).where(eq(noticeComments.id, id));
    return comment || undefined;
  }

  async createNoticeComment(comment: InsertNoticeComment): Promise<NoticeComment> {
    const [created] = await this.db.insert(noticeComments).values(comment).returning();
    return created;
  }

  async updateNoticeComment(id: number, content: string): Promise<NoticeComment | undefined> {
    const [updated] = await this.db.update(noticeComments).set({ content }).where(eq(noticeComments.id, id)).returning();
    return updated || undefined;
  }

  async deleteNoticeComment(id: number): Promise<void> {
    await this.db.delete(noticeComments).where(eq(noticeComments.id, id));
  }

  private async getPaperAttachmentMetadata(
    executor: any,
    paperId?: number,
  ): Promise<PaperAttachmentMetadata[]> {
    const query = executor
      .select({
        id: paperAttachments.id,
        paperId: paperAttachments.paperId,
        fileName: paperAttachments.fileName,
        mimeType: paperAttachments.mimeType,
        byteSize: paperAttachments.byteSize,
        sortOrder: paperAttachments.sortOrder,
        createdAt: paperAttachments.createdAt,
      })
      .from(paperAttachments);
    const rows = paperId === undefined
      ? await query.orderBy(asc(paperAttachments.paperId), asc(paperAttachments.sortOrder), asc(paperAttachments.id))
      : await query
        .where(eq(paperAttachments.paperId, paperId))
        .orderBy(asc(paperAttachments.sortOrder), asc(paperAttachments.id));
    return rows;
  }

  private async getPaperWithAttachments(
    executor: any,
    id: number,
  ): Promise<PaperWithAttachments | undefined> {
    const [paper] = await executor.select().from(papers).where(eq(papers.id, id));
    if (!paper) return undefined;
    return {
      ...paper,
      attachments: await this.getPaperAttachmentMetadata(executor, id),
    };
  }

  async getPapers(): Promise<PaperWithAttachments[]> {
    const records = await this.db.select().from(papers).orderBy(desc(papers.id));
    if (!records.length) return [];
    const attachments = await this.getPaperAttachmentMetadata(this.db);
    const attachmentsByPaper = new Map<number, PaperAttachmentMetadata[]>();
    attachments.forEach(attachment => {
      const group = attachmentsByPaper.get(attachment.paperId) ?? [];
      group.push(attachment);
      attachmentsByPaper.set(attachment.paperId, group);
    });
    return records.map((paper: Paper) => ({
      ...paper,
      attachments: attachmentsByPaper.get(paper.id) ?? [],
    }));
  }

  async getPaper(id: number): Promise<PaperWithAttachments | undefined> {
    return await this.getPaperWithAttachments(this.db, id);
  }

  async getPaperAttachment(id: number): Promise<PaperAttachment | undefined> {
    const [attachment] = await this.db
      .select()
      .from(paperAttachments)
      .where(eq(paperAttachments.id, id));
    return attachment || undefined;
  }

  async createPaper(
    paper: InsertPaper,
    attachments: StoredPaperAttachmentInput[] = [],
  ): Promise<PaperWithAttachments> {
    return await this.db.transaction(async (transaction: any) => {
      const [created] = await transaction.insert(papers).values(paper).returning();
      if (attachments.length) {
        await transaction.insert(paperAttachments).values(attachments.map((attachment, index) => ({
          ...attachment,
          paperId: created.id,
          sortOrder: index,
        })));
      }
      return (await this.getPaperWithAttachments(transaction, created.id))!;
    });
  }

  async updatePaper(id: number, paper: Partial<InsertPaper>): Promise<PaperWithAttachments | undefined> {
    const [updated] = await this.db.update(papers).set(paper).where(eq(papers.id, id)).returning();
    return updated ? await this.getPaperWithAttachments(this.db, id) : undefined;
  }

  async updatePaperWithAttachments(
    id: number,
    paper: Partial<InsertPaper>,
    additions: StoredPaperAttachmentInput[],
    deleteAttachmentIds: number[],
    maxPaperBytes: number,
    maxPaperAttachments: number,
  ): Promise<UpdatePaperWithAttachmentsResult> {
    return await this.db.transaction(async (transaction: any) => {
      await transaction.execute(sql`SELECT id FROM papers WHERE id = ${id} FOR UPDATE`);
      const [existingPaper] = await transaction.select().from(papers).where(eq(papers.id, id));
      if (!existingPaper) return { status: "not_found" } as const;

      const current = await this.getPaperAttachmentMetadata(transaction, id);
      const requestedIds = new Set(deleteAttachmentIds);
      if (requestedIds.size !== deleteAttachmentIds.length
        || deleteAttachmentIds.some(attachmentId => !current.some(item => item.id === attachmentId))) {
        return { status: "attachment_not_found" } as const;
      }
      const remaining = current.filter(attachment => !requestedIds.has(attachment.id));
      if (remaining.length + additions.length > maxPaperAttachments) {
        return { status: "paper_full" } as const;
      }
      const totalBytes = remaining.reduce((sum, attachment) => sum + attachment.byteSize, 0)
        + additions.reduce((sum, attachment) => sum + attachment.byteSize, 0);
      if (totalBytes > maxPaperBytes) return { status: "paper_too_large" } as const;

      if (Object.keys(paper).length) {
        await transaction.update(papers).set(paper).where(eq(papers.id, id));
      }
      if (deleteAttachmentIds.length) {
        await transaction.execute(sql`
          DELETE FROM paper_attachments
          WHERE paper_id = ${id}
            AND id = ANY(${deleteAttachmentIds}::int[])
        `);
      }
      for (let index = 0; index < remaining.length; index += 1) {
        await transaction
          .update(paperAttachments)
          .set({ sortOrder: index })
          .where(eq(paperAttachments.id, remaining[index].id));
      }
      if (additions.length) {
        await transaction.insert(paperAttachments).values(additions.map((attachment, index) => ({
          ...attachment,
          paperId: id,
          sortOrder: remaining.length + index,
        })));
      }
      return {
        status: "updated",
        paper: (await this.getPaperWithAttachments(transaction, id))!,
      } as const;
    });
  }

  async addPaperAttachments(
    id: number,
    attachments: StoredPaperAttachmentInput[],
    maxPaperBytes: number,
    maxPaperAttachments: number,
  ): Promise<AddPaperAttachmentsResult> {
    return await this.db.transaction(async (transaction: any) => {
      await transaction.execute(sql`SELECT id FROM papers WHERE id = ${id} FOR UPDATE`);
      const [paper] = await transaction.select().from(papers).where(eq(papers.id, id));
      if (!paper) return { status: "not_found" } as const;
      const existing = await this.getPaperAttachmentMetadata(transaction, id);
      if (existing.length + attachments.length > maxPaperAttachments) {
        return { status: "paper_full" } as const;
      }
      const totalBytes = existing.reduce((sum, attachment) => sum + attachment.byteSize, 0)
        + attachments.reduce((sum, attachment) => sum + attachment.byteSize, 0);
      if (totalBytes > maxPaperBytes) return { status: "paper_too_large" } as const;
      if (attachments.length) {
        await transaction.insert(paperAttachments).values(attachments.map((attachment, index) => ({
          ...attachment,
          paperId: id,
          sortOrder: existing.length + index,
        })));
      }
      return {
        status: "created",
        paper: (await this.getPaperWithAttachments(transaction, id))!,
      } as const;
    });
  }

  async replacePaperAttachment(
    id: number,
    attachment: StoredPaperAttachmentInput,
    maxPaperBytes: number,
  ): Promise<ReplacePaperAttachmentResult> {
    return await this.db.transaction(async (transaction: any) => {
      const [candidate] = await transaction
        .select()
        .from(paperAttachments)
        .where(eq(paperAttachments.id, id));
      if (!candidate) return { status: "not_found" } as const;
      await transaction.execute(sql`SELECT id FROM papers WHERE id = ${candidate.paperId} FOR UPDATE`);
      const existing = await this.getPaperAttachmentMetadata(transaction, candidate.paperId);
      const totalBytes = existing
        .filter(item => item.id !== id)
        .reduce((sum, item) => sum + item.byteSize, 0) + attachment.byteSize;
      if (totalBytes > maxPaperBytes) return { status: "paper_too_large" } as const;
      const [updated] = await transaction
        .update(paperAttachments)
        .set({ ...attachment, createdAt: new Date() })
        .where(eq(paperAttachments.id, id))
        .returning();
      if (!updated) return { status: "not_found" } as const;
      return {
        status: "updated",
        attachment: paperAttachmentMetadata(updated),
      } as const;
    });
  }

  async deletePaperAttachment(id: number): Promise<boolean> {
    return await this.db.transaction(async (transaction: any) => {
      const [candidate] = await transaction
        .select()
        .from(paperAttachments)
        .where(eq(paperAttachments.id, id));
      if (!candidate) return false;
      await transaction.execute(sql`SELECT id FROM papers WHERE id = ${candidate.paperId} FOR UPDATE`);
      const [deleted] = await transaction
        .delete(paperAttachments)
        .where(eq(paperAttachments.id, id))
        .returning({ id: paperAttachments.id });
      if (!deleted) return false;
      const remaining = await this.getPaperAttachmentMetadata(transaction, candidate.paperId);
      for (let index = 0; index < remaining.length; index += 1) {
        await transaction
          .update(paperAttachments)
          .set({ sortOrder: index })
          .where(eq(paperAttachments.id, remaining[index].id));
      }
      return true;
    });
  }

  async deletePaper(id: number): Promise<void> {
    await this.db.transaction(async (transaction: any) => {
      await transaction.delete(paperComments).where(eq(paperComments.paperId, id));
      await transaction.delete(papers).where(eq(papers.id, id));
    });
  }

  async incrementPaperViews(id: number): Promise<void> {
    await this.db
      .update(papers)
      .set({ views: sql`${papers.views} + 1` })
      .where(eq(papers.id, id));
  }

  async getPaperComments(paperId: number): Promise<PaperComment[]> {
    return await this.db.select().from(paperComments).where(eq(paperComments.paperId, paperId)).orderBy(desc(paperComments.id));
  }

  async getPaperComment(id: number): Promise<PaperComment | undefined> {
    const [comment] = await this.db.select().from(paperComments).where(eq(paperComments.id, id));
    return comment || undefined;
  }

  async createPaperComment(comment: InsertPaperComment): Promise<PaperComment> {
    const [created] = await this.db.insert(paperComments).values(comment).returning();
    return created;
  }

  async updatePaperComment(id: number, content: string): Promise<PaperComment | undefined> {
    const [updated] = await this.db.update(paperComments).set({ content }).where(eq(paperComments.id, id)).returning();
    return updated || undefined;
  }

  async deletePaperComment(id: number): Promise<void> {
    await this.db.delete(paperComments).where(eq(paperComments.id, id));
  }

  async getTalents(): Promise<Talent[]> {
    return await this.db.select().from(talents).orderBy(desc(talents.id));
  }

  async getTalent(id: number): Promise<Talent | undefined> {
    const [talent] = await this.db.select().from(talents).where(eq(talents.id, id));
    return talent || undefined;
  }

  async createTalent(talent: InsertTalent): Promise<Talent> {
    const [created] = await this.db.insert(talents).values(talent).returning();
    return created;
  }

  async updateTalent(id: number, talent: Partial<InsertTalent>): Promise<Talent | undefined> {
    const [updated] = await this.db.update(talents).set(talent).where(eq(talents.id, id)).returning();
    return updated || undefined;
  }

  async deleteTalent(id: number): Promise<void> {
    await this.db.delete(talents).where(eq(talents.id, id));
  }
}

let storage: IStorage;

export async function initializeStorage(): Promise<IStorage> {
  const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    const errorMsg = "CRITICAL: DATABASE_URL or NEON_DATABASE_URL must be set. Cannot start server without database!";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    const { db, ensureTablesExist } = await import("./db");
    await ensureTablesExist();
    storage = new DatabaseStorage(db);
    console.log("✅ Database storage initialized successfully - All data will be saved to Neon PostgreSQL");
    return storage;
  } catch (error: any) {
    console.error("❌ CRITICAL: Failed to initialize database:", error.message);
    console.error("❌ Cannot start server without database connection!");
    throw error; // 메모리 스토리지로 폴백하지 않고 에러 발생
  }
}

export function getStorage(): IStorage {
  if (!storage) {
    throw new Error("Storage not initialized. Call initializeStorage() first.");
  }
  return storage;
}

export { storage };
