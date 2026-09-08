import {
  type DragEvent,
  type FormEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useParams } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  Images,
  ImagePlus,
  List,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, type PhotoAlbum, type PhotoAlbumInput, type PhotoImage } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 9;
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
type PhotoSearchScope = "all" | "title" | "content";
const SHARED_RESOURCES_URL = "https://drive.google.com/drive/folders/1WoLoXcT7wRbpyxldRxXyyMKYTuZR0k4L?usp=drive_link";
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const currentKoreanIsoDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const emptyAlbumForm = (): PhotoAlbumInput => ({
  title: "",
  content: "",
  organization: "데이터지식서비스공학과",
  date: currentKoreanIsoDate(),
});

const normalizeDateForInput = (date: string) => date.replaceAll(".", "-").slice(0, 10);
const formatDate = (date: string) => date.replaceAll("-", ".");

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const isAcceptedImage = (file: File) =>
  acceptedImageTypes.has(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);

const validateImages = (files: File[], existingCount = 0) => {
  if (files.some((file) => !isAcceptedImage(file))) {
    return "JPG, PNG, WebP 형식의 사진만 등록할 수 있습니다.";
  }
  if (files.some((file) => file.size === 0)) {
    return "내용이 없는 사진 파일은 등록할 수 없습니다.";
  }
  if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
    return "사진 한 장의 최대 크기는 8MB입니다.";
  }
  if (existingCount + files.length > MAX_IMAGES) {
    return `앨범당 사진은 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`;
  }
  return null;
};

const mergeUniqueFiles = (current: File[], added: File[]) => {
  const seen = new Set(current.map((file) => `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`));
  return [
    ...current,
    ...added.filter((file) => {
      const key = `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
};

const previewTitles = [
  "2026학년도 데이터지식서비스공학과 연구세미나",
  "AI·메타버스 융합연구 프로젝트 발표회",
  "데이터사이언스 박사과정 공동연구 워크숍",
  "AIMS Lab 산학협력 연구교류회",
  "대학원 신입생 연구 오리엔테이션",
  "인공지능 기반 지식서비스 특강",
  "학술대회 우수논문 발표 세션",
  "데이터 분석 방법론 집중 세미나",
  "대학원 연구성과 공유회",
  "융합연구 네트워킹 데이",
];

const makePreviewImage = (albumId: number, index: number): PhotoImage => ({
  id: albumId * 100 + index + 1,
  albumId,
  fileName: `dankook-event-${index + 1}.png`,
  mimeType: "image/png",
  byteSize: 2_480_000 + index * 75_000,
  width: 1900,
  height: 1267,
  sortOrder: index,
  altText: null,
  url: "/dankook-campus-hero.png",
  downloadUrl: "/dankook-campus-hero.png",
});

const previewAlbums: PhotoAlbum[] = previewTitles.map((title, index) => {
  const id = 110 - index;
  const coverImage = makePreviewImage(id, 0);
  return {
    id,
    title,
    content: "데이터지식서비스공학과 구성원이 함께한 교육·연구 활동 현장입니다.",
    organization: "데이터지식서비스공학과",
    date: `2026-${String(8 - Math.floor(index / 2)).padStart(2, "0")}-${String(24 - index).padStart(2, "0")}`,
    views: 128 + index * 17,
    imageCount: index === 0 ? 5 : 3,
    coverImage,
    downloadUrl: "/dankook-campus-hero.png",
  };
});

const previewAlbumDetail = (id: number) => {
  const album = previewAlbums.find((item) => item.id === id);
  if (!album) return null;
  const images = Array.from({ length: album.imageCount }, (_, index) => makePreviewImage(id, index));
  return { ...album, coverImage: images[0], images };
};

function ResourceSidebar() {
  return (
    <aside className="lg:sticky lg:top-36 lg:self-start" aria-label="자료실 메뉴">
      <h2 className="border-b border-slate-300 pb-4 text-2xl font-black tracking-[-0.03em] text-slate-950">자료실</h2>
      <nav className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1" aria-label="자료실 하위 메뉴">
        <Link
          href="/photos"
          aria-current="page"
          className="flex min-h-12 items-center rounded-md bg-[#0B2B50] px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#123b69] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2156D9] focus-visible:ring-offset-2"
        >
          사진자료실
        </Link>
        <a
          href={SHARED_RESOURCES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center justify-between rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:border-blue-200 hover:text-[#2156D9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2156D9] focus-visible:ring-offset-2"
        >
          공유자료실
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </nav>
    </aside>
  );
}

type AlbumFormFieldsProps = {
  form: PhotoAlbumInput;
  onChange: (next: PhotoAlbumInput) => void;
  prefix: string;
};

function AlbumFormFields({ form, onChange, prefix }: AlbumFormFieldsProps) {
  return (
    <div className="grid gap-5">
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-title`} className="font-bold">제목</Label>
        <Input
          id={`${prefix}-title`}
          value={form.title}
          maxLength={150}
          onChange={(event) => onChange({ ...form, title: event.target.value })}
          className="h-11 rounded-md"
          placeholder="사진 앨범 제목"
          required
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-organization`} className="font-bold">게시 기관</Label>
          <Input
            id={`${prefix}-organization`}
            value={form.organization}
            maxLength={100}
            onChange={(event) => onChange({ ...form, organization: event.target.value })}
            className="h-11 rounded-md"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-date`} className="font-bold">행사일</Label>
          <Input
            id={`${prefix}-date`}
            type="date"
            value={form.date}
            onChange={(event) => onChange({ ...form, date: event.target.value })}
            className="h-11 rounded-md"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-content`} className="font-bold">설명</Label>
        <Textarea
          id={`${prefix}-content`}
          value={form.content}
          maxLength={3000}
          onChange={(event) => onChange({ ...form, content: event.target.value })}
          className="min-h-28 resize-y rounded-md"
          placeholder="행사와 사진에 대한 설명을 입력해 주세요."
        />
      </div>
    </div>
  );
}

type SelectedFileListProps = {
  files: File[];
  onRemove: (index: number) => void;
  disabled: boolean;
};

function SelectedFileList({ files, onRemove, disabled }: SelectedFileListProps) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-3 max-h-40 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 px-3">
      {files.map((file, index) => (
        <li key={`${file.name}-${file.lastModified}-${index}`} className="flex min-h-11 items-center gap-2 py-2 text-sm">
          <FileImage className="h-4 w-4 shrink-0 text-[#2156D9]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-slate-700">{file.name}</span>
          <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
            disabled={disabled}
            className="h-9 w-9 shrink-0 rounded-md text-slate-500 hover:text-rose-700"
            aria-label={`${file.name} 선택 취소`}
          >
            <X className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

type ImageDropzoneProps = {
  id: string;
  testId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  selectedCount: number;
  helperText: string;
  onFiles: (files: File[]) => void;
};

function ImageDropzone({
  id,
  testId,
  inputRef,
  disabled,
  selectedCount,
  helperText,
  onFiles,
}: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const helperId = `${id}-helper`;
  const statusId = `${id}-status`;

  useEffect(() => {
    if (!disabled) return;
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, [disabled]);

  const hasFiles = (event: DragEvent<HTMLButtonElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleDragEnter = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || !hasFiles(event)) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length > 0) onFiles(droppedFiles);
  };

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        disabled={disabled}
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files ?? []);
          if (selectedFiles.length > 0) onFiles(selectedFiles);
          event.currentTarget.value = "";
        }}
        className="hidden"
        data-testid={`${testId}-input`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled && hasFiles(event)) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={handleDragLeave}
        onDragEnd={() => {
          dragDepthRef.current = 0;
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        aria-describedby={`${helperId} ${statusId}`}
        className={`group flex min-h-36 w-full flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-5 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2156D9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          isDragging
            ? "border-[#2156D9] bg-blue-50 ring-2 ring-[#2156D9]/20"
            : "border-slate-300 bg-white hover:border-[#2156D9] hover:bg-blue-50/50"
        }`}
        data-testid={testId}
        data-drop-active={isDragging ? "true" : "false"}
      >
        <span className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${isDragging ? "bg-[#2156D9] text-white" : "bg-blue-50 text-[#2156D9] group-hover:bg-blue-100"}`}>
          <Upload className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="mt-3 text-sm font-extrabold text-slate-800">
          {isDragging ? "사진을 여기에 놓아 주세요" : "사진을 드래그하거나 클릭해 선택하세요"}
        </span>
        <span id={helperId} className="mt-1 text-xs leading-5 text-slate-500">{helperText}</span>
      </button>
      <p id={statusId} className="text-xs leading-5 text-slate-500" role="status" aria-live="polite">
        선택 {selectedCount}/{MAX_IMAGES}장
      </p>
    </>
  );
}

type CreateAlbumDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (album: PhotoAlbum) => void;
};

function CreateAlbumDialog({ open, onOpenChange, onCreated }: CreateAlbumDialogProps) {
  const [form, setForm] = useState<PhotoAlbumInput>(emptyAlbumForm);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setForm(emptyAlbumForm());
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const chooseFiles = (selected: File[]) => {
    const nextFiles = mergeUniqueFiles(files, selected);
    const message = validateImages(nextFiles);
    if (message) {
      toast.error(message);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFiles(nextFiles);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || !form.organization.trim() || !form.date) {
      toast.error("제목, 게시 기관과 행사일을 입력해 주세요.");
      return;
    }
    if (files.length < 1) {
      toast.error("사진을 1장 이상 선택해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const created = await api.photos.create({
        title: form.title.trim(),
        content: form.content.trim(),
        organization: form.organization.trim(),
        date: form.date,
      }, files);
      toast.success("사진 앨범을 등록했습니다.");
      onCreated(created);
      onOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "사진 앨범 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">사진 앨범 등록</DialogTitle>
          <DialogDescription>행사 정보와 JPG·PNG·WebP 사진 1~12장을 등록합니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="mt-2 space-y-6">
          <AlbumFormFields form={form} onChange={setForm} prefix="create-photo" />
          <div className="space-y-2">
            <Label htmlFor="create-photo-files" className="font-bold">사진 파일</Label>
            <ImageDropzone
              id="create-photo-files"
              testId="photo-create-dropzone"
              inputRef={fileInputRef}
              disabled={saving}
              selectedCount={files.length}
              helperText="JPG·PNG·WebP, 최대 12장 · 파일당 8MB"
              onFiles={chooseFiles}
            />
            <SelectedFileList files={files} disabled={saving} onRemove={(index) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
          </div>
          <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex gap-3 border-t border-slate-200 bg-white px-6 pb-6 pt-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)} className="h-11 flex-1 rounded-md px-6">취소</Button>
            <Button type="submit" disabled={saving} className="h-11 flex-1 rounded-md bg-[#2156D9] px-6 font-bold hover:bg-[#1848bc]">
              {saving ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />등록 중...</> : <><Upload className="mr-2 h-4 w-4" />앨범 등록</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PhotoCard({ album }: { album: PhotoAlbum }) {
  const cover = album.coverImage;
  return (
    <Link
      href={`/photos/${album.id}`}
      className="group min-w-0 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[0_5px_18px_rgba(15,35,64,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_26px_rgba(15,35,64,0.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2156D9] focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
      data-testid={`photo-album-${album.id}`}
    >
      <div className="h-[130px] overflow-hidden bg-slate-100 sm:aspect-[3/2] sm:h-auto lg:aspect-auto lg:h-[177px]">
        {cover ? (
          <img
            src={api.photos.imageUrl(cover)}
            alt={`${album.title} 대표 사진`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025] motion-reduce:transition-none"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400" aria-label="대표 사진 없음">
            <Images className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="px-3 py-3.5 sm:px-4 sm:py-4">
        <h3 className="overflow-hidden text-[14px] font-extrabold leading-[1.45] tracking-[-0.025em] text-slate-900 transition-colors group-hover:text-[#2156D9] sm:text-[15px] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {album.title}
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 sm:text-xs">
          <span>{formatDate(album.date)}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden="true" />{album.views.toLocaleString("ko-KR")}</span>
          <span aria-hidden="true">·</span>
          <span>{album.imageCount}장</span>
        </div>
      </div>
    </Link>
  );
}

const paginationWindow = (current: number, total: number) => {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const ordered = Array.from(pages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
};

function PhotoList({ isAdmin }: { isAdmin: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const [, setLocation] = useLocation();
  const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<PhotoSearchScope>("all");
  const [appliedSearchScope, setAppliedSearchScope] = useState<PhotoSearchScope>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const previewMode = import.meta.env.DEV && window.location.port === "4173";

  const loadAlbums = async () => {
    setLoading(true);
    setError(null);
    if (previewMode) {
      setAlbums(previewAlbums);
      setLoading(false);
      return;
    }
    try {
      setAlbums(await api.photos.list());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사진자료실을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlbums();
  }, []);

  useEffect(() => {
    if (isAdmin) return;
    setCreateOpen(false);
  }, [isAdmin]);

  const filteredAlbums = useMemo(() => {
    const keyword = searchQuery.trim().toLocaleLowerCase("ko-KR");
    return [...albums]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .filter((album) => {
        if (!keyword) return true;
        const values = appliedSearchScope === "title"
          ? [album.title]
          : appliedSearchScope === "content"
            ? [album.content]
            : [album.title, album.content];
        return values.some((value) => value.toLocaleLowerCase("ko-KR").includes(keyword));
      });
  }, [albums, appliedSearchScope, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAlbums.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const displayedAlbums = filteredAlbums.slice((safeCurrentPage - 1) * ITEMS_PER_PAGE, safeCurrentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearchScope(searchScope);
    setSearchQuery(searchInput.trim());
  };

  return (
    <section aria-labelledby="photo-list-title" className="min-w-0">
      <div className="flex flex-col gap-5 border-b-2 border-slate-900 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold tracking-[0.16em] text-[#2156D9]">PHOTO ARCHIVE</p>
          <h2 id="photo-list-title" className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">사진자료실</h2>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="h-11 rounded-md bg-[#2156D9] px-5 font-bold hover:bg-[#1848bc]" data-testid="button-photo-create">
            <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />사진 등록
          </Button>
        )}
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600" role="status" aria-live="polite">
          총 <strong className="font-extrabold text-slate-900">{filteredAlbums.length}</strong>개의 앨범
        </p>
        <form onSubmit={submitSearch} role="search" className="flex w-full max-w-lg gap-2">
          <Label htmlFor="photo-search-scope" className="sr-only">사진자료실 검색 범위</Label>
          <select
            id="photo-search-scope"
            value={searchScope}
            onChange={(event) => setSearchScope(event.target.value as PhotoSearchScope)}
            className="h-11 w-[94px] shrink-0 rounded-md border border-input bg-white px-2 text-sm text-slate-700 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#2156D9] focus-visible:ring-offset-2 sm:w-[112px] sm:px-3"
          >
            <option value="all">제목+내용</option>
            <option value="title">제목</option>
            <option value="content">내용</option>
          </select>
          <Label htmlFor="photo-search" className="sr-only">사진자료실 검색어</Label>
          <Input
            id="photo-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="검색어 입력"
            className="h-11 min-w-0 rounded-md bg-white"
          />
          <Button type="submit" className="h-11 shrink-0 rounded-md bg-[#0B2B50] px-3 font-bold hover:bg-[#123b69] sm:px-4">
            <Search className="mr-1 h-4 w-4 sm:mr-2" aria-hidden="true" />검색
          </Button>
        </form>
      </div>

      {loading && (
        <div className="mt-7 grid grid-cols-2 gap-x-[10px] gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3" aria-label="사진 앨범을 불러오는 중입니다">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
              <Skeleton className="h-[130px] rounded-none sm:aspect-[3/2] sm:h-auto lg:aspect-auto lg:h-[177px]" />
              <div className="space-y-3 p-4"><Skeleton className="h-5 w-full" /><Skeleton className="h-4 w-3/5" /></div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="mt-7 rounded-[10px] border border-rose-200 bg-rose-50 px-6 py-12 text-center" role="alert">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-extrabold text-slate-900">사진자료실을 표시할 수 없습니다</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
          <Button variant="outline" onClick={() => void loadAlbums()} className="mt-5 h-11 rounded-md border-rose-200 bg-white font-bold">다시 시도</Button>
        </div>
      )}

      {!loading && !error && displayedAlbums.length === 0 && (
        <div className="mt-7 rounded-[10px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Images className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-extrabold text-slate-900">{searchQuery ? "검색 결과가 없습니다" : "등록된 사진 앨범이 없습니다"}</h3>
          <p className="mt-2 text-sm text-slate-500">{searchQuery ? "다른 검색어로 다시 찾아보세요." : "새로운 학과 활동 사진이 등록되면 이곳에 표시됩니다."}</p>
          {searchQuery && <Button variant="outline" onClick={() => { setSearchInput(""); setSearchQuery(""); setSearchScope("all"); setAppliedSearchScope("all"); }} className="mt-5 h-11 rounded-md font-bold">검색 초기화</Button>}
        </div>
      )}

      {!loading && !error && displayedAlbums.length > 0 && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.35 }}
          className="mt-7 grid grid-cols-2 gap-x-[10px] gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3"
        >
          {displayedAlbums.map((album) => <PhotoCard key={album.id} album={album} />)}
        </motion.div>
      )}

      {!loading && !error && filteredAlbums.length > ITEMS_PER_PAGE && (
        <nav className="mt-10 flex items-center justify-center gap-1" aria-label="사진자료실 페이지">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            className="h-11 w-11 rounded-md"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {paginationWindow(safeCurrentPage, totalPages).map((item, index) => item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="flex h-11 w-8 items-center justify-center text-slate-400" aria-hidden="true">…</span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === safeCurrentPage ? "default" : "ghost"}
              size="icon"
              onClick={() => setCurrentPage(item)}
              className={`h-11 w-11 rounded-md font-bold ${item === safeCurrentPage ? "bg-[#2156D9] hover:bg-[#1848bc]" : "text-slate-600"}`}
              aria-label={`${item}페이지`}
              aria-current={item === safeCurrentPage ? "page" : undefined}
            >
              {item}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={safeCurrentPage === totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            className="h-11 w-11 rounded-md"
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}

      {isAdmin && (
        <CreateAlbumDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(album) => {
            setLocation(`/photos/${album.id}`);
          }}
        />
      )}
    </section>
  );
}

const recentPhotoViews = new Map<number, number>();

function PhotoDetail({ albumId, isAdmin }: { albumId: number; isAdmin: boolean }) {
  const [, setLocation] = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const thumbnailRailRef = useRef<HTMLDivElement>(null);
  const addFilesRef = useRef<HTMLInputElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const [album, setAlbum] = useState<PhotoAlbum | null>(null);
  const [albumList, setAlbumList] = useState<PhotoAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(!shouldReduceMotion);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<PhotoAlbumInput>(emptyAlbumForm);
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [deleteAlbumOpen, setDeleteAlbumOpen] = useState(false);
  const [deleteImageId, setDeleteImageId] = useState<number | null>(null);
  const [deletingAlbum, setDeletingAlbum] = useState(false);
  const previewMode = import.meta.env.DEV && window.location.port === "4173";

  const refreshAlbum = async () => {
    if (previewMode) {
      const detail = previewAlbumDetail(albumId);
      if (detail) setAlbum(detail);
      return detail;
    }
    const detail = await api.photos.get(albumId);
    setAlbum(detail);
    setCurrentIndex((index) => Math.min(index, Math.max(0, (detail.images?.length ?? 1) - 1)));
    return detail;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setCurrentIndex(0);
    setIsPlaying(!shouldReduceMotion);

    const load = async () => {
      if (!Number.isInteger(albumId) || albumId <= 0) {
        setError("올바르지 않은 사진 앨범 주소입니다.");
        setLoading(false);
        return;
      }
      if (previewMode) {
        const detail = previewAlbumDetail(albumId);
        if (!detail) {
          setError("사진 앨범을 찾을 수 없습니다.");
        } else if (active) {
          setAlbum({ ...detail, views: detail.views + 1 });
          setAlbumList(previewAlbums);
        }
        if (active) setLoading(false);
        return;
      }
      try {
        const [detail, list] = await Promise.all([api.photos.get(albumId), api.photos.list()]);
        if (!active) return;
        setAlbum(detail);
        setAlbumList(list);
        const now = Date.now();
        if (now - (recentPhotoViews.get(albumId) ?? 0) > 1200) {
          recentPhotoViews.set(albumId, now);
          api.photos.incrementViews(albumId).then((result) => {
            if (active) setAlbum((current) => current ? { ...current, views: result.views } : current);
          }).catch(() => {
            // 사진 열람은 유지하고 조회수 갱신 오류만 무시합니다.
          });
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "사진 앨범을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [albumId, previewMode, shouldReduceMotion]);

  const images = useMemo(
    () => [...(album?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [album?.images],
  );
  const currentImage = images[currentIndex] ?? null;

  useEffect(() => {
    if (!isPlaying || shouldReduceMotion || images.length < 2) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((index) => (index + 1) % images.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [images.length, isPlaying, shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion) setIsPlaying(false);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (isAdmin) return;
    setEditOpen(false);
    setEditForm(emptyAlbumForm());
    setAddFiles([]);
    setDeleteAlbumOpen(false);
    setDeleteImageId(null);
    setSavingMetadata(false);
    setImageBusy(false);
    setDeletingAlbum(false);
    if (addFilesRef.current) addFilesRef.current.value = "";
  }, [isAdmin]);

  useEffect(() => {
    const rail = thumbnailRailRef.current;
    const selected = rail?.querySelector<HTMLElement>(`[data-thumbnail-index="${currentIndex}"]`);
    if (!rail || !selected) return;
    rail.scrollTo({
      left: selected.offsetLeft - (rail.clientWidth - selected.clientWidth) / 2,
      behavior: shouldReduceMotion ? "auto" : "smooth",
    });
  }, [currentIndex, shouldReduceMotion]);

  const sortedAlbums = useMemo(
    () => [...albumList].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [albumList],
  );
  const albumIndex = sortedAlbums.findIndex((item) => item.id === albumId);
  const olderAlbum = albumIndex >= 0 ? sortedAlbums[albumIndex + 1] ?? null : null;
  const newerAlbum = albumIndex > 0 ? sortedAlbums[albumIndex - 1] ?? null : null;

  const moveImage = (direction: -1 | 1) => {
    if (images.length < 2) return;
    setCurrentIndex((index) => (index + direction + images.length) % images.length);
  };

  const openEditor = () => {
    if (!album) return;
    setEditForm({
      title: album.title,
      content: album.content,
      organization: album.organization,
      date: normalizeDateForInput(album.date),
    });
    setAddFiles([]);
    if (addFilesRef.current) addFilesRef.current.value = "";
    setEditOpen(true);
  };

  const saveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!album || !editForm.title.trim() || !editForm.organization.trim() || !editForm.date) {
      toast.error("제목, 게시 기관과 행사일을 입력해 주세요.");
      return;
    }
    setSavingMetadata(true);
    try {
      await api.photos.update(album.id, {
        title: editForm.title.trim(),
        content: editForm.content.trim(),
        organization: editForm.organization.trim(),
        date: editForm.date,
      });
      await refreshAlbum();
      setEditOpen(false);
      toast.success("앨범 정보를 수정했습니다.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "앨범 정보 수정에 실패했습니다.");
    } finally {
      setSavingMetadata(false);
    }
  };

  const selectAdditionalFiles = (selected: File[]) => {
    const nextFiles = mergeUniqueFiles(addFiles, selected);
    const message = validateImages(nextFiles, images.length);
    if (message) {
      toast.error(message);
      if (addFilesRef.current) addFilesRef.current.value = "";
      return;
    }
    setAddFiles(nextFiles);
  };

  const uploadAdditionalImages = async () => {
    if (!album || addFiles.length === 0) {
      toast.error("추가할 사진을 선택해 주세요.");
      return;
    }
    setImageBusy(true);
    try {
      await api.photos.addImages(album.id, addFiles);
      await refreshAlbum();
      setAddFiles([]);
      if (addFilesRef.current) addFilesRef.current.value = "";
      toast.success("사진을 추가했습니다.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "사진 추가에 실패했습니다.");
    } finally {
      setImageBusy(false);
    }
  };

  const reorderImage = async (index: number, direction: -1 | 1) => {
    if (!album) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const previous = album;
    setAlbum({
      ...album,
      coverImage: reordered[0],
      images: reordered.map((image, order) => ({ ...image, sortOrder: order })),
    });
    setImageBusy(true);
    try {
      await api.photos.reorderImages(album.id, reordered.map((image) => image.id));
      await refreshAlbum();
    } catch (caught) {
      setAlbum(previous);
      toast.error(caught instanceof Error ? caught.message : "사진 순서 변경에 실패했습니다.");
    } finally {
      setImageBusy(false);
    }
  };

  const deleteImage = async () => {
    if (deleteImageId === null) return;
    setImageBusy(true);
    try {
      await api.photos.deleteImage(deleteImageId);
      setDeleteImageId(null);
      await refreshAlbum();
      toast.success("사진을 삭제했습니다.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "사진 삭제에 실패했습니다.");
    } finally {
      setImageBusy(false);
    }
  };

  const deleteAlbum = async () => {
    if (!album) return;
    setDeletingAlbum(true);
    try {
      await api.photos.delete(album.id);
      toast.success("사진 앨범을 삭제했습니다.");
      setLocation("/photos");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "사진 앨범 삭제에 실패했습니다.");
    } finally {
      setDeletingAlbum(false);
    }
  };

  if (loading) {
    return (
      <section aria-label="사진 앨범을 불러오는 중입니다" className="min-w-0">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="mt-4 h-5 w-2/5" />
        <Skeleton className="mt-8 aspect-[4/3] w-full max-w-[822px] rounded-[10px]" />
        <div className="mt-4 flex gap-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="aspect-[3/2] w-28 shrink-0" />)}</div>
      </section>
    );
  }

  if (error || !album) {
    return (
      <section className="min-w-0 rounded-[10px] border border-rose-200 bg-rose-50 px-6 py-14 text-center" role="alert">
        <AlertCircle className="mx-auto h-9 w-9 text-rose-600" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-black text-slate-900">사진 앨범을 표시할 수 없습니다</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error ?? "요청한 사진 앨범을 찾을 수 없습니다."}</p>
        <Button asChild variant="outline" className="mt-6 h-11 rounded-md bg-white font-bold"><Link href="/photos"><ArrowLeft className="mr-2 h-4 w-4" />사진자료실로 돌아가기</Link></Button>
      </section>
    );
  }

  return (
    <article className="min-w-0" aria-labelledby="photo-detail-title">
      <div className="mx-auto max-w-[822px] border-b border-slate-300 pb-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold tracking-[0.16em] text-[#2156D9]">PHOTO ARCHIVE</p>
            <h2 id="photo-detail-title" className="mt-2 text-2xl font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-3xl">{album.title}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{album.organization}</span>
              <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" aria-hidden="true" />조회수 {album.views.toLocaleString("ko-KR")}</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" aria-hidden="true" />{formatDate(album.date)}</span>
            </div>
          </div>
          {isAdmin && (
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={openEditor} className="h-11 rounded-md font-bold"><Pencil className="mr-2 h-4 w-4" />수정</Button>
              <Button variant="outline" onClick={() => setDeleteAlbumOpen(true)} className="h-11 rounded-md border-rose-200 font-bold text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Trash2 className="mr-2 h-4 w-4" />삭제</Button>
            </div>
          )}
        </div>
      </div>

      {currentImage ? (
        <div className="mt-8">
          <div
            className="relative mx-auto aspect-[4/3] w-full max-w-[822px] overflow-hidden bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2156D9] focus-visible:ring-offset-2"
            role="region"
            aria-label="사진 슬라이드"
            tabIndex={images.length > 1 ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setIsPlaying(false);
                moveImage(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setIsPlaying(false);
                moveImage(1);
              }
            }}
            onTouchStart={(event) => {
              touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartXRef.current;
              const endX = event.changedTouches[0]?.clientX;
              touchStartXRef.current = null;
              if (startX === null || endX === undefined || Math.abs(startX - endX) < 40) return;
              setIsPlaying(false);
              moveImage(startX > endX ? 1 : -1);
            }}
          >
            <motion.img
              key={currentImage.id}
              src={api.photos.imageUrl(currentImage)}
              alt={currentImage.altText || `${album.title} 사진 ${currentIndex + 1}`}
              className="h-full w-full object-cover"
              initial={shouldReduceMotion ? false : { opacity: 0.35 }}
              animate={{ opacity: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.22 }}
              decoding="async"
              fetchPriority={currentIndex === 0 ? "high" : "auto"}
            />
            {images.length > 1 && (
              <>
                <Button type="button" variant="secondary" size="icon" onClick={() => { setIsPlaying(false); moveImage(-1); }} className="absolute left-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full border border-white/40 bg-slate-950/65 text-white shadow-lg backdrop-blur-sm hover:bg-slate-950/85" aria-label="이전 사진">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button type="button" variant="secondary" size="icon" onClick={() => { setIsPlaying(false); moveImage(1); }} className="absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full border border-white/40 bg-slate-950/65 text-white shadow-lg backdrop-blur-sm hover:bg-slate-950/85" aria-label="다음 사진">
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-slate-950/70 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm" aria-live="polite">
              <span>{currentIndex + 1} / {images.length}</span>
              {images.length > 1 && (
                <button
                  type="button"
                  disabled={Boolean(shouldReduceMotion)}
                  onClick={() => setIsPlaying((playing) => !playing)}
                  className="inline-flex min-h-7 items-center gap-1 border-l border-white/30 pl-2 text-white disabled:cursor-not-allowed disabled:text-white/55"
                  aria-label={shouldReduceMotion ? "동작 줄이기 설정으로 자동 재생을 사용할 수 없습니다" : isPlaying ? "사진 자동 재생 일시정지" : "사진 자동 재생 시작"}
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{isPlaying ? "일시정지" : "자동재생"}</span>
                </button>
              )}
            </div>
          </div>

          {images.length > 1 && (
            <div ref={thumbnailRailRef} className="mx-auto mt-4 hidden max-w-[822px] gap-[5px] overflow-x-auto pb-2 min-[1025px]:flex" aria-label="사진 썸네일 목록">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  data-thumbnail-index={index}
                  onClick={() => { setCurrentIndex(index); setIsPlaying(false); }}
                  className={`h-[140px] w-[210px] shrink-0 overflow-hidden rounded-md border-2 bg-slate-100 transition ${index === currentIndex ? "border-[#2156D9] ring-2 ring-blue-100" : "border-transparent opacity-75 hover:opacity-100"}`}
                  aria-label={`${index + 1}번 사진 보기`}
                  aria-current={index === currentIndex ? "true" : undefined}
                >
                  <img src={api.photos.imageUrl(image)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 rounded-[10px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Images className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
          <p className="mt-3 font-bold text-slate-700">표시할 사진이 없습니다.</p>
        </div>
      )}

      <div className="mx-auto mt-9 max-w-[822px] border-y border-slate-200 py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900">앨범 설명</h3>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{album.content || "등록된 설명이 없습니다."}</p>
          </div>
          {images.length > 0 && (
            <Button asChild className="h-11 shrink-0 rounded-md bg-[#0B2B50] px-5 font-bold hover:bg-[#123b69]">
              <a href={api.photos.albumDownloadUrl(album)} download>
                <Download className="mr-2 h-4 w-4" />전체 사진 다운로드
              </a>
            </Button>
          )}
        </div>
      </div>

      {images.length > 0 && (
        <section className="mx-auto max-w-[822px] border-b border-slate-200 py-7" aria-labelledby="photo-files-title">
          <h3 id="photo-files-title" className="text-lg font-black text-slate-900">개별 사진 다운로드</h3>
          <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {images.map((image, index) => (
              <li key={image.id} className="flex min-h-14 items-center gap-3 py-2.5 text-sm">
                <FileImage className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-slate-700">{image.fileName || `사진-${index + 1}`}</span>
                {formatBytes(image.byteSize) && <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{formatBytes(image.byteSize)}</span>}
                <a href={api.photos.imageDownloadUrl(image)} download className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 font-bold text-[#2156D9] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2156D9]" aria-label={`${image.fileName} 다운로드`}>
                  <Download className="h-4 w-4" />다운로드
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="mx-auto mt-8 max-w-[822px] border-y border-slate-300" aria-label="사진 앨범 이전 다음 탐색">
        {olderAlbum && (
          <Link href={`/photos/${olderAlbum.id}`} className="group grid min-h-14 grid-cols-[84px_1fr] items-center border-b border-slate-200 px-2 text-sm sm:grid-cols-[110px_1fr]">
            <span className="inline-flex items-center gap-1 font-bold text-slate-500"><ChevronLeft className="h-4 w-4" />이전 앨범</span>
            <span className="truncate font-semibold text-slate-700 group-hover:text-[#2156D9]">{olderAlbum.title}</span>
          </Link>
        )}
        {newerAlbum && (
          <Link href={`/photos/${newerAlbum.id}`} className="group grid min-h-14 grid-cols-[84px_1fr] items-center px-2 text-sm sm:grid-cols-[110px_1fr]">
            <span className="inline-flex items-center gap-1 font-bold text-slate-500"><ChevronRight className="h-4 w-4" />다음 앨범</span>
            <span className="truncate font-semibold text-slate-700 group-hover:text-[#2156D9]">{newerAlbum.title}</span>
          </Link>
        )}
      </nav>

      <div className="mx-auto mt-6 flex max-w-[822px] justify-end">
        <Button asChild variant="outline" className="h-11 rounded-md border-slate-300 bg-white px-5 font-bold"><Link href="/photos"><List className="mr-2 h-4 w-4" />목록</Link></Button>
      </div>

      {isAdmin && (
        <>
          <Dialog open={editOpen} onOpenChange={(next) => { if (!savingMetadata && !imageBusy) setEditOpen(next); }}>
            <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-black">사진 앨범 수정</DialogTitle>
                <DialogDescription>앨범 정보와 사진 순서를 변경하거나 사진을 추가·삭제할 수 있습니다.</DialogDescription>
              </DialogHeader>
              <form onSubmit={(event) => void saveMetadata(event)} className="mt-2 space-y-5 border-b border-slate-200 pb-6">
                <AlbumFormFields form={editForm} onChange={setEditForm} prefix="edit-photo" />
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingMetadata || imageBusy} className="h-11 rounded-md bg-[#2156D9] px-6 font-bold hover:bg-[#1848bc]">
                    {savingMetadata ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />저장 중...</> : "앨범 정보 저장"}
                  </Button>
                </div>
              </form>

              <section className="mt-6" aria-labelledby="manage-photo-images-title">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 id="manage-photo-images-title" className="font-black text-slate-900">사진 관리</h3>
                    <p className="mt-1 text-xs text-slate-500">맨 위 사진이 앨범 대표 사진으로 표시됩니다. 현재 {images.length}/{MAX_IMAGES}장</p>
                  </div>
                </div>
                <ol className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200">
                  {images.map((image, index) => (
                    <li key={image.id} className="flex items-center gap-3 p-3">
                      <img src={api.photos.imageUrl(image)} alt="" className="aspect-[3/2] w-20 shrink-0 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{image.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">{index === 0 ? "대표 사진" : `${index + 1}번째 사진`}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" variant="ghost" size="icon" disabled={imageBusy || index === 0} onClick={() => void reorderImage(index, -1)} className="h-10 w-10 rounded-md" aria-label={`${image.fileName} 순서 위로`}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" disabled={imageBusy || index === images.length - 1} onClick={() => void reorderImage(index, 1)} className="h-10 w-10 rounded-md" aria-label={`${image.fileName} 순서 아래로`}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" disabled={imageBusy || images.length <= 1} onClick={() => setDeleteImageId(image.id)} className="h-10 w-10 rounded-md text-rose-700 hover:bg-rose-50 hover:text-rose-800" aria-label={`${image.fileName} 삭제`}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </li>
                  ))}
                </ol>
                {images.length <= 1 && <p className="mt-2 text-xs text-slate-500">앨범에는 최소 1장의 사진이 필요하므로 마지막 사진은 삭제할 수 없습니다.</p>}

                <div className="mt-6 rounded-md bg-slate-50 p-4">
                  <Label htmlFor="add-photo-files" className="font-bold">사진 추가</Label>
                  <div className="mt-2 space-y-3">
                    <ImageDropzone
                      id="add-photo-files"
                      testId="photo-edit-add-dropzone"
                      inputRef={addFilesRef}
                      disabled={imageBusy || images.length >= MAX_IMAGES}
                      selectedCount={addFiles.length}
                      helperText={images.length >= MAX_IMAGES ? "앨범당 최대 사진 수에 도달했습니다." : `JPG·PNG·WebP, 최대 ${MAX_IMAGES - images.length}장 추가 · 파일당 8MB`}
                      onFiles={selectAdditionalFiles}
                    />
                    <div className="flex justify-end">
                      <Button type="button" onClick={() => void uploadAdditionalImages()} disabled={imageBusy || addFiles.length === 0} className="h-11 shrink-0 rounded-md bg-[#0B2B50] px-5 font-bold hover:bg-[#123b69]">
                        {imageBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}선택한 사진 추가
                      </Button>
                    </div>
                  </div>
                  <SelectedFileList files={addFiles} disabled={imageBusy} onRemove={(index) => setAddFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                </div>
              </section>
            </DialogContent>
          </Dialog>

          <AlertDialog open={deleteImageId !== null} onOpenChange={(next) => { if (!next && !imageBusy) setDeleteImageId(null); }}>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>이 사진을 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>삭제한 사진은 복구할 수 없습니다. 앨범의 나머지 사진은 유지됩니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={imageBusy} className="h-11 rounded-md">취소</AlertDialogCancel>
                <AlertDialogAction disabled={imageBusy} onClick={(event) => { event.preventDefault(); void deleteImage(); }} className="h-11 rounded-md bg-rose-700 text-white hover:bg-rose-800">{imageBusy ? "삭제 중..." : "사진 삭제"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={deleteAlbumOpen} onOpenChange={(next) => { if (!deletingAlbum) setDeleteAlbumOpen(next); }}>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>사진 앨범을 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>앨범에 포함된 사진 {images.length}장도 함께 삭제되며 이 작업은 복구할 수 없습니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingAlbum} className="h-11 rounded-md">취소</AlertDialogCancel>
                <AlertDialogAction disabled={deletingAlbum} onClick={(event) => { event.preventDefault(); void deleteAlbum(); }} className="h-11 rounded-md bg-rose-700 text-white hover:bg-rose-800">{deletingAlbum ? "삭제 중..." : "앨범 삭제"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </article>
  );
}

export default function Photos() {
  const params = useParams<{ id?: string }>();
  const albumId = params.id ? Number(params.id) : null;
  const { user: sessionUser } = useSession();
  const isAdmin = sessionUser?.role === "ADMIN";

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50">
      <Header />
      <PageHero
        eyebrow="PHOTO ARCHIVE"
        title="사진자료실"
        description="데이터지식서비스공학과의 교육·연구 활동 현장을 사진으로 만나보세요."
        imageSrc="/dankook-campus-hero.png"
        objectPosition="50% 50%"
        overlayClassName="bg-[#071B33]/72"
      />
      <main className="flex-1 py-10 lg:py-14">
        <div className="mx-auto grid max-w-[1200px] gap-9 px-[10px] sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10 lg:px-10 xl:grid-cols-[250px_minmax(0,870px)] xl:gap-20 xl:px-0">
          <ResourceSidebar />
          {albumId === null ? <PhotoList isAdmin={isAdmin} /> : <PhotoDetail albumId={albumId} isAdmin={isAdmin} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}
