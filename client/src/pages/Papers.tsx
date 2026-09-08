import { useState, useEffect, useMemo, useRef, type DragEvent } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { Users, FileText, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ExternalLink, Download, Eye, UploadCloud, X, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageHero from "@/components/PageHero";
import { api, Paper, type PaperAttachment } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

type CategoryKey = "conference" | "journal";

const categoryTitles: Record<CategoryKey, string> = {
  conference: "학술대회",
  journal: "저널",
};

const normalizeCategory = (value?: string | null): CategoryKey =>
  value?.includes("journal") ? "journal" : "conference";

const isValidWebsiteUrl = (value: string) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const ITEMS_PER_PAGE = 5;
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_BYTES = 30 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = ["pdf", "doc", "docx", "hwp", "hwpx", "ppt", "pptx", "jpg", "jpeg", "png", "webp"];
const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
};

const fileExtension = (fileName: string) => fileName.split(".").pop()?.toLowerCase() || "";

interface AttachmentDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  existingCount?: number;
  existingBytes?: number;
  disabled?: boolean;
  id: string;
}

function AttachmentDropzone({
  files,
  onChange,
  existingCount = 0,
  existingBytes = 0,
  disabled = false,
  id,
}: AttachmentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (disabled) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  }, [disabled]);

  const addFiles = (incoming: File[]) => {
    if (disabled || incoming.length === 0) return;

    const next = [...files];
    let nextBytes = existingBytes + next.reduce((total, file) => total + file.size, 0);
    const errors = new Set<string>();

    incoming.forEach((file) => {
      if (!ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name))) {
        errors.add("지원하지 않는 파일 형식이 포함되어 있습니다.");
        return;
      }
      if (file.size === 0) {
        errors.add("내용이 없는 파일은 첨부할 수 없습니다.");
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        errors.add("파일 한 개의 크기는 10MB 이하여야 합니다.");
        return;
      }
      if (existingCount + next.length >= MAX_ATTACHMENT_COUNT) {
        errors.add("첨부파일은 최대 5개까지 등록할 수 있습니다.");
        return;
      }
      if (nextBytes + file.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
        errors.add("첨부파일 전체 크기는 30MB 이하여야 합니다.");
        return;
      }
      if (next.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) {
        errors.add("같은 파일은 한 번만 첨부할 수 있습니다.");
        return;
      }
      next.push(file);
      nextBytes += file.size;
    });

    if (next.length !== files.length) onChange(next);
    errors.forEach((message) => toast.error(message));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        multiple
        accept={ATTACHMENT_ACCEPT}
        disabled={disabled}
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={`${id}-help`}
        onClick={() => { if (!disabled) inputRef.current?.click(); }}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          dragDepthRef.current += 1;
          if (!disabled) setIsDragging(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`group flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          isDragging
            ? "border-primary bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-primary hover:bg-blue-50/60"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        data-testid={`${id}-dropzone`}
        data-drop-active={isDragging ? "true" : "false"}
      >
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-primary transition-transform group-hover:-translate-y-0.5">
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-bold text-slate-800">
          파일을 이곳에 끌어놓거나 <span className="text-primary underline underline-offset-2">직접 선택</span>하세요
        </p>
        <p id={`${id}-help`} className="mt-1.5 text-xs leading-5 text-slate-500">
          PDF · Word · HWP/HWPX · PPT · JPG/PNG/WebP<br />최대 5개 · 파일당 10MB · 전체 30MB
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500" aria-live="polite">
            첨부 예정 {existingCount + files.length}/{MAX_ATTACHMENT_COUNT}개 · {formatFileSize(existingBytes + files.reduce((total, file) => total + file.size, 0))}
          </p>
          <ul className="space-y-2" aria-label="새 첨부파일">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5">
              <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                className="h-10 w-10 shrink-0 rounded-md text-slate-500 hover:bg-white hover:text-destructive"
                onClick={(event) => { event.stopPropagation(); onChange(files.filter((_, fileIndex) => fileIndex !== index)); }}
                aria-label={`${file.name} 첨부 취소`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Papers() {
  const params = useParams<{ category?: string }>();
  const category = normalizeCategory(params.category);
  const { user: sessionUser } = useSession();
  const isAdmin = sessionUser?.role === "ADMIN";

  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [attachmentDeleteCandidate, setAttachmentDeleteCandidate] = useState<PaperAttachment | null>(null);
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);
  const [viewingPaper, setViewingPaper] = useState<Paper | null>(null);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [attachmentIdsToDelete, setAttachmentIdsToDelete] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    authors: "",
    websiteUrl: "",
  });

  const loadPapers = async () => {
    try {
      const data = await api.papers.list();
      setPapers(data);
    } catch (e) {
      console.error("Failed to load papers", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPapers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [category]);

  useEffect(() => {
    if (isAdmin) return;
    setIsAddOpen(false);
    setIsEditOpen(false);
    setDeleteId(null);
    setAttachmentDeleteCandidate(null);
    setEditingPaper(null);
    setNewAttachments([]);
    setAttachmentIdsToDelete([]);
    setSaving(false);
    setDeleting(false);
  }, [isAdmin]);

  const currentPapers = useMemo(() => {
    return papers.filter(p => normalizeCategory(p.category) === category);
  }, [papers, category]);

  const totalPages = Math.ceil(currentPapers.length / ITEMS_PER_PAGE);
  const displayedPapers = showAll ? currentPapers : currentPapers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const activeEditingAttachments = (editingPaper?.attachments || []).filter(
    (attachment) => !attachmentIdsToDelete.includes(attachment.id),
  );
  const activeEditingAttachmentBytes = activeEditingAttachments.reduce(
    (total, attachment) => total + attachment.byteSize,
    0,
  );

  const openAdd = () => {
    setFormData({ title: "", authors: "", websiteUrl: "" });
    setNewAttachments([]);
    setAttachmentIdsToDelete([]);
    setIsAddOpen(true);
  };

  const openEdit = (paper: Paper) => {
    setEditingPaper(paper);
    setFormData({
      title: paper.title,
      authors: paper.authors,
      websiteUrl: paper.websiteUrl || "",
    });
    setNewAttachments([]);
    setAttachmentIdsToDelete([]);
    setIsEditOpen(true);
  };

  const openView = async (paper: Paper) => {
    try {
      await api.papers.incrementViews(paper.id);
      const updated = await api.papers.get(paper.id);
      setViewingPaper(updated);
      setPapers(prev => prev.map(p => p.id === paper.id ? updated : p));
      setIsViewOpen(true);
    } catch (e) {
      setViewingPaper(paper);
      setIsViewOpen(true);
    }
  };

  const handleAdd = async () => {
    if (!formData.title.trim()) {
      toast.error("논문 제목을 입력해주세요.");
      return;
    }
    if (!formData.authors.trim()) {
      toast.error("저자를 입력해주세요.");
      return;
    }
    if (!isValidWebsiteUrl(formData.websiteUrl.trim())) {
      toast.error("http:// 또는 https://로 시작하는 사이트 주소를 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      await api.papers.create({
        category,
        title: formData.title.trim(),
        authors: formData.authors.trim(),
        firstAuthor: null,
        correspondingAuthor: null,
        venue: null,
        journal: null,
        volume: null,
        year: String(new Date().getFullYear()),
        abstract: null,
        keywords: [],
        websiteUrl: formData.websiteUrl.trim() || null,
        date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
      }, newAttachments);
      await loadPapers();
      setIsAddOpen(false);
      setNewAttachments([]);
      toast.success("논문이 등록되었습니다.");
    } catch (e: any) {
      console.error("Failed to add paper", e);
      toast.error(e.message || "논문 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editingPaper) return;
    if (!formData.title.trim()) {
      toast.error("논문 제목을 입력해주세요.");
      return;
    }
    if (!formData.authors.trim()) {
      toast.error("저자를 입력해주세요.");
      return;
    }
    if (!isValidWebsiteUrl(formData.websiteUrl.trim())) {
      toast.error("http:// 또는 https://로 시작하는 사이트 주소를 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      await api.papers.updateWithAttachments(
        editingPaper.id,
        {
          title: formData.title.trim(),
          authors: formData.authors.trim(),
          websiteUrl: formData.websiteUrl.trim() || null,
          deleteAttachmentIds: attachmentIdsToDelete,
        },
        newAttachments,
      );
      await loadPapers();
      setIsEditOpen(false);
      setEditingPaper(null);
      setNewAttachments([]);
      setAttachmentIdsToDelete([]);
      toast.success("논문이 수정되었습니다.");
    } catch (e: any) {
      console.error("Failed to edit paper", e);
      toast.error(e.message || "논문 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await api.papers.delete(deleteId);
      await loadPapers();
      setDeleteId(null);
    } catch (e) {
      console.error("Failed to delete paper", e);
      toast.error(e instanceof Error ? e.message : "논문 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <PageHero
        eyebrow="PAPERS"
        title="논문"
        description="학과 연구 논문 및 학술 성과를 확인하세요."
        imageSrc="/page-hero-papers.jpg"
        objectPosition="50% 50%"
        overlayClassName="bg-[#071B33]/68"
      />

      <section className="py-10 lg:py-14 flex-1">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8">
            <Tabs value={category} className="w-full lg:w-auto">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-white p-1 shadow-md lg:w-[360px]">
                {(Object.keys(categoryTitles) as CategoryKey[]).map(cat => (
                  <TabsTrigger key={cat} value={cat} asChild className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-blue-600 data-[state=active]:text-white" data-testid={`paper-category-${cat}`}>
                    <Link href={`/papers/${cat}`}>{categoryTitles[cat]}</Link>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowAll(!showAll); setCurrentPage(1); }} className="rounded-lg font-semibold px-4 h-11">
                <Eye className="w-4 h-4 mr-2" />{showAll ? "페이지별 보기" : "전체보기"}
              </Button>
              {isAdmin && (
                <Button onClick={openAdd} className="rounded-lg shadow-md font-bold px-6 bg-gradient-to-r from-primary to-blue-600 h-11"><Plus className="w-4 h-4 mr-2" />등록</Button>
              )}
            </div>
          </div>

          <motion.div key={category} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="mb-6 border-l-4 border-primary pl-4">
              <h2 className="text-xl font-black text-gray-900 lg:text-2xl">{categoryTitles[category]}</h2>
              <p className="mt-1 text-sm text-slate-500">학과의 연구 성과와 학술 활동을 확인할 수 있습니다.</p>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="p-16 text-center text-gray-500">로딩 중...</div>
              ) : displayedPapers.map((paper) => (
                <Card key={paper.id} className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-blue-200 hover:shadow-md">
                  <CardContent className="p-5 lg:p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="mb-2 text-lg font-bold text-gray-900">
                            <button type="button" className="text-left transition-colors hover:text-primary focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" onClick={() => openView(paper)} data-testid={`paper-view-${paper.id}`}>
                              {paper.title}
                            </button>
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-base text-gray-600 mb-2">
                          <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{paper.authors}</span>
                          {paper.firstAuthor && <span className="text-sm text-blue-600">주저자: {paper.firstAuthor}</span>}
                          {paper.correspondingAuthor && <span className="text-sm text-green-600">교신저자: {paper.correspondingAuthor}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                          {(paper.venue || paper.journal) && <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" />{paper.venue || paper.journal}{paper.volume && ` (${paper.volume})`}</span>}
                          <Badge variant="secondary" className="gap-1 border border-slate-200 bg-slate-100 font-semibold text-slate-600"><Eye className="h-3.5 w-3.5" />조회수 {paper.views}</Badge>
                          {paper.websiteUrl && <a href={paper.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 hover:underline"><ExternalLink className="w-3.5 h-3.5" />사이트</a>}
                        </div>
                        {((paper.attachments?.length || 0) > 0 || (paper.files?.length || 0) > 0) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(paper.attachments || []).map((attachment) => (
                              <span key={attachment.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-slate-700">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                                <span className="max-w-56 truncate">{attachment.fileName}</span>
                              </span>
                            ))}
                            {(paper.attachments?.length || 0) === 0 && paper.files?.map((fileName, index) => (
                              <span key={`${fileName}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="max-w-56 truncate">{fileName}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-11 w-11 rounded-lg" onClick={() => openEdit(paper)} aria-label={`${paper.title} 수정`}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 rounded-lg text-destructive" onClick={() => setDeleteId(paper.id)} aria-label={`${paper.title} 삭제`}><Trash2 className="w-4 h-4" /></Button></div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!loading && currentPapers.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-16 text-center text-gray-500"><p className="text-base">등록된 논문이 없습니다.</p></div>}
            </div>

            {!showAll && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button variant="outline" size="icon" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="rounded-lg"><ChevronLeft className="w-4 h-4" /></Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => <Button key={page} variant={currentPage === page ? "default" : "outline"} className="rounded-lg w-10 h-10" onClick={() => setCurrentPage(page)}>{page}</Button>)}
                <Button variant="outline" size="icon" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="rounded-lg"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-2xl rounded-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold pr-8">{viewingPaper?.title}</DialogTitle>
            <DialogDescription>논문 상세 정보를 확인합니다.</DialogDescription>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 pt-2">
              <span className="flex items-center gap-1"><Users className="w-4 h-4" />{viewingPaper?.authors}</span>
              <Badge variant="secondary" className="gap-1 border border-slate-200 bg-slate-100 font-semibold text-slate-600"><Eye className="h-3.5 w-3.5" />조회수 {viewingPaper?.views ?? 0}</Badge>
            </div>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              {(viewingPaper?.venue || viewingPaper?.journal) && <p className="text-gray-700 text-base"><strong>게재처:</strong> {viewingPaper.venue || viewingPaper.journal}{viewingPaper.volume && ` (${viewingPaper.volume})`}</p>}
              {viewingPaper?.firstAuthor && <p className="text-blue-600 text-base"><strong>주저자:</strong> {viewingPaper.firstAuthor}</p>}
              {viewingPaper?.correspondingAuthor && <p className="text-green-600 text-base"><strong>교신저자:</strong> {viewingPaper.correspondingAuthor}</p>}
              {viewingPaper?.websiteUrl && <p className="text-base"><strong>사이트:</strong> <a href={viewingPaper.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{viewingPaper.websiteUrl}</a></p>}
            </div>
            {viewingPaper?.attachments && viewingPaper.attachments.length > 0 && (
              <div className="space-y-2">
                <Label className="font-bold text-base">첨부파일</Label>
                <div className="space-y-2">
                  {viewingPaper.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-primary shadow-sm"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{formatFileSize(attachment.byteSize)}</p>
                        </div>
                      </div>
                      <a
                        href={api.papers.attachmentDownloadUrl(attachment)}
                        download={attachment.fileName}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 text-sm font-bold text-primary transition-colors hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />다운로드
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(!viewingPaper?.attachments || viewingPaper.attachments.length === 0) && viewingPaper?.files && viewingPaper.files.length > 0 && (
              <div className="space-y-2">
                <Label className="font-bold text-base">기존 첨부파일</Label>
                <div className="space-y-2">
                  {viewingPaper.files.map((fileStr, index) => {
                    const isUrl = fileStr.startsWith('/uploads/');
                    const displayName = isUrl ? decodeURIComponent(fileStr.split('/').pop()?.replace(/^\d+-\d+-/, '') || fileStr) : fileStr;
                    const downloadUrl = isUrl ? fileStr : '';
                    return (
                      <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" aria-hidden="true" /><span className="text-sm font-medium text-gray-700">{displayName}</span></div>
                        {downloadUrl ? (
                          <a href={downloadUrl} download={displayName} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-primary hover:bg-blue-100 rounded-lg transition-colors"><Download className="w-4 h-4" />다운로드</a>
                        ) : (
                          <span className="text-sm text-orange-500">재업로드 필요</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdmin && isAddOpen} onOpenChange={(open) => { if (!saving) { setIsAddOpen(open); if (!open) setNewAttachments([]); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-xl sm:max-w-2xl" data-testid="paper-add-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">등록</DialogTitle>
            <DialogDescription className="text-base">{categoryTitles[category]}에 새 논문을 등록합니다.</DialogDescription>
          </DialogHeader>
          <form className="mt-4 space-y-5" onSubmit={(event) => { event.preventDefault(); void handleAdd(); }}>
            <div className="space-y-2">
              <Label htmlFor="paper-title" className="font-bold">논문 제목</Label>
              <Input id="paper-title" placeholder="논문 제목을 입력하세요" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="h-12 rounded-lg text-base" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paper-authors" className="font-bold">저자</Label>
              <Input id="paper-authors" placeholder="저자를 입력하세요" value={formData.authors} onChange={(e) => setFormData({ ...formData, authors: e.target.value })} className="h-12 rounded-lg text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paper-website" className="font-bold">사이트 주소 (선택)</Label>
              <Input id="paper-website" type="url" inputMode="url" placeholder="https://example.com" value={formData.websiteUrl} onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })} className="h-12 rounded-lg text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paper-attachments" className="font-bold">첨부파일 (선택)</Label>
              <AttachmentDropzone
                id="paper-attachments"
                files={newAttachments}
                onChange={setNewAttachments}
                disabled={saving}
              />
            </div>
            <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex gap-3 border-t border-slate-200 bg-white px-6 pb-6 pt-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={saving} className="h-12 flex-1 rounded-lg text-base">취소</Button>
              <Button type="submit" disabled={saving} className="h-12 flex-1 rounded-lg bg-gradient-to-r from-primary to-blue-600 text-base font-bold" data-testid="paper-submit">{saving ? "등록 중..." : "등록"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdmin && isEditOpen} onOpenChange={(open) => { if (!saving) { setIsEditOpen(open); if (!open) { setNewAttachments([]); setAttachmentIdsToDelete([]); setEditingPaper(null); } } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-xl sm:max-w-2xl">
          <DialogHeader><DialogTitle className="text-xl font-bold">논문 수정</DialogTitle><DialogDescription>논문 정보와 첨부파일을 수정합니다.</DialogDescription></DialogHeader>
          <form className="mt-4 space-y-5" onSubmit={(event) => { event.preventDefault(); void handleEdit(); }}>
            <div className="space-y-2"><Label htmlFor="edit-paper-title" className="font-bold">논문 제목</Label><Input id="edit-paper-title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="h-12 rounded-lg text-base" /></div>
            <div className="space-y-2"><Label htmlFor="edit-paper-authors" className="font-bold">저자</Label><Input id="edit-paper-authors" value={formData.authors} onChange={(e) => setFormData({ ...formData, authors: e.target.value })} className="h-12 rounded-lg text-base" /></div>
            <div className="space-y-2"><Label htmlFor="edit-paper-website" className="font-bold">사이트 주소 (선택)</Label><Input id="edit-paper-website" type="url" inputMode="url" value={formData.websiteUrl} onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })} className="h-12 rounded-lg text-base" /></div>
            {(editingPaper?.attachments?.length || 0) > 0 && (
              <div className="space-y-2">
                <Label className="font-bold">등록된 첨부파일</Label>
                <ul className="space-y-2">
                  {(editingPaper?.attachments || []).map((attachment) => {
                    const isMarkedForDelete = attachmentIdsToDelete.includes(attachment.id);
                    return (
                      <li key={attachment.id} className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 ${isMarkedForDelete ? "border-rose-200 bg-rose-50 opacity-70" : "border-slate-200 bg-white"}`}>
                        <FileText className={`h-5 w-5 shrink-0 ${isMarkedForDelete ? "text-rose-500" : "text-primary"}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-semibold ${isMarkedForDelete ? "text-rose-700 line-through" : "text-slate-800"}`}>{attachment.fileName}</p>
                          <p className="text-xs text-slate-500">{formatFileSize(attachment.byteSize)}{isMarkedForDelete ? " · 저장하면 삭제됩니다" : ""}</p>
                        </div>
                        {isMarkedForDelete ? (
                          <Button type="button" variant="ghost" size="sm" disabled={saving} className="h-10 shrink-0 rounded-md text-slate-600" onClick={() => setAttachmentIdsToDelete((current) => current.filter((id) => id !== attachment.id))}>
                            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />되돌리기
                          </Button>
                        ) : (
                          <Button type="button" variant="ghost" size="icon" disabled={saving} className="h-10 w-10 shrink-0 rounded-md text-slate-500 hover:text-destructive" onClick={() => setAttachmentDeleteCandidate(attachment)} aria-label={`${attachment.fileName} 삭제`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-paper-attachments" className="font-bold">새 첨부파일 (선택)</Label>
              <AttachmentDropzone
                id="edit-paper-attachments"
                files={newAttachments}
                onChange={setNewAttachments}
                existingCount={activeEditingAttachments.length}
                existingBytes={activeEditingAttachmentBytes}
                disabled={saving}
              />
            </div>
            <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex gap-3 border-t border-slate-200 bg-white px-6 pb-6 pt-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]"><Button type="button" variant="outline" onClick={() => setIsEditOpen(false)} disabled={saving} className="h-12 flex-1 rounded-lg text-base">취소</Button><Button type="submit" disabled={saving} className="h-12 flex-1 rounded-lg bg-gradient-to-r from-primary to-blue-600 text-base font-bold">{saving ? "수정 중..." : "수정"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isAdmin && deleteId !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteId(null); }}>
        <AlertDialogContent className="rounded-xl"><AlertDialogHeader><AlertDialogTitle>논문을 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleting} className="h-11 rounded-lg">취소</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void handleDelete(); }} className="h-11 rounded-lg bg-destructive text-destructive-foreground">{deleting ? "삭제 중..." : "삭제"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isAdmin && attachmentDeleteCandidate !== null} onOpenChange={(open) => { if (!open) setAttachmentDeleteCandidate(null); }}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>첨부파일을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {attachmentDeleteCandidate?.fileName} 파일은 논문 수정을 저장할 때 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-lg">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (attachmentDeleteCandidate) {
                  setAttachmentIdsToDelete((current) => [...current, attachmentDeleteCandidate.id]);
                }
                setAttachmentDeleteCandidate(null);
              }}
              className="h-11 rounded-lg bg-destructive text-destructive-foreground"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}
