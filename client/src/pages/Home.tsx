import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Database,
  ExternalLink,
  GraduationCap,
  Images,
  Megaphone,
  Network,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { api, type Notice } from "@/lib/api";

const resources = [
  { title: "학과 내규 및 학사 운영 기준", href: "/regulations", label: "학과 내규" },
  { title: "국내·외 학술 논문 및 연구 실적", href: "/papers", label: "논문" },
  { title: "학과 교육·연구 활동 사진", href: "/photos", label: "사진" },
  {
    title: "데이터지식서비스공학과 공유 자료실",
    href: "https://drive.google.com/drive/folders/1WoLoXcT7wRbpyxldRxXyyMKYTuZR0k4L?usp=drive_link",
    label: "공유 자료",
    external: true,
  },
  { title: "대학원 입학 모집요강", href: "/admissions/guidelines", label: "입학안내" },
];

const quickLinks = [
  { icon: GraduationCap, title: "학과 소개", href: "/about", external: false },
  { icon: Megaphone, title: "공지사항", href: "/notices", external: false },
  { icon: BookOpen, title: "논문", href: "/papers", external: false },
  { icon: Scale, title: "학과 내규", href: "/regulations", external: false },
  { icon: ClipboardList, title: "입학안내", href: "/admissions/guidelines", external: false },
  { icon: Images, title: "사진자료실", href: "/photos", external: false },
];

const programs = [
  {
    icon: Database,
    title: "데이터사이언스",
    description: "데이터 수집·관리·분석 전 과정을 설계하고 현장의 문제를 해결하는 데이터 전문가를 양성합니다.",
  },
  {
    icon: BrainCircuit,
    title: "AI·머신러닝",
    description: "기계학습과 인공지능 기술을 비즈니스와 공공 영역에 적용하는 연구 역량을 강화합니다.",
  },
  {
    icon: Network,
    title: "융합형 지식서비스",
    description: "컴퓨터학·통계학·경영학을 연결해 새로운 데이터 기반 지식서비스를 설계합니다.",
  },
];

const previewNotices: Notice[] = [
  {
    id: 1,
    title: "2025학년도 전기 대학원 신입생 모집 안내",
    content: "",
    date: "2025-01-10",
    views: 0,
    isImportant: true,
    files: [],
    comments: [],
  },
  {
    id: 2,
    title: "2025학년도 1학기 학사 일정 안내",
    content: "",
    date: "2025-01-08",
    views: 0,
    isImportant: true,
    files: [],
    comments: [],
  },
  {
    id: 3,
    title: "AI·머신러닝 특강 개최 안내",
    content: "",
    date: "2025-01-05",
    views: 0,
    isImportant: false,
    files: [],
    comments: [],
  },
  {
    id: 4,
    title: "데이터 융합 프로젝트 발표회 개최",
    content: "",
    date: "2025-01-03",
    views: 0,
    isImportant: false,
    files: [],
    comments: [],
  },
];

export default function Home() {
  const isLocalPreview = import.meta.env.DEV && window.location.port === "4173";
  const [notices, setNotices] = useState<Notice[]>(() => isLocalPreview ? previewNotices : []);

  useEffect(() => {
    if (isLocalPreview) return;
    api.notices.list().then((data) => setNotices(data.slice(0, 4))).catch(() => setNotices([]));
  }, [isLocalPreview]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header />

      <main>
        <section className="relative isolate min-h-[440px] overflow-hidden lg:min-h-[460px]" aria-labelledby="hero-title">
          <img
            src="/dankook-campus-hero.png"
            alt="단국대학교 죽전캠퍼스 전경"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,31,63,0.96)_0%,rgba(5,40,79,0.88)_35%,rgba(5,40,79,0.38)_68%,rgba(5,40,79,0.10)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(3,20,41,0.12)_0%,rgba(3,20,41,0.28)_100%)]" />

          <div className="mx-auto flex min-h-[440px] max-w-[1200px] items-center px-5 py-14 sm:px-8 lg:min-h-[460px] lg:px-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: "easeOut" }}
              className="max-w-[720px]"
            >
              <p className="mb-5 flex items-center gap-3 text-sm font-bold tracking-[0.2em] text-blue-100 sm:text-base">
                <span className="h-px w-9 bg-amber-400" aria-hidden="true" />
                DATA SCIENCE
              </p>
              <h1 id="hero-title" className="max-w-[680px] text-[clamp(31px,9.7vw,35px)] font-black leading-[1.2] tracking-[-0.055em] text-white sm:text-5xl sm:tracking-[-0.045em] lg:text-[3.15rem]">
                <span className="block whitespace-nowrap">데이터로 지식을 만들고,</span>
                <span className="block">미래를 설계합니다</span>
              </h1>
              <p className="mt-5 max-w-full text-[16px] font-bold leading-6 tracking-[-0.015em] text-white drop-shadow-[0_2px_6px_rgba(3,20,41,0.85)] sm:mt-6 sm:text-lg sm:leading-7">
                직장인을 위한{" "}
                <strong className="font-black text-[#F4A000]">토요일 전일 수업</strong>
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-13 rounded-md bg-[#2156D9] px-7 text-base font-bold text-white shadow-[0_12px_28px_rgba(0,35,91,0.28)] hover:bg-[#1848bc]" data-testid="button-intro">
                  <Link href="/about">
                    학과 소개 보기 <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 rounded-md border-white/70 bg-white/10 px-7 text-base font-bold text-white backdrop-blur-sm hover:bg-white hover:text-slate-900" data-testid="button-admissions">
                  <Link href="/admissions/guidelines">모집요강 보기</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white py-14 lg:py-16" aria-label="최근 게시물">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-10">
            <article>
              <div className="mb-5 flex items-end justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <p className="mb-1 text-xs font-bold tracking-[0.16em] text-[#2156D9]">NOTICE</p>
                  <h2 className="text-2xl font-extrabold tracking-[-0.03em]">최신 공지</h2>
                </div>
                <Link href="/notices" className="inline-flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-[#2156D9]" data-testid="link-notices-more">
                  전체보기 <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="divide-y divide-slate-200">
                {notices.length === 0 ? (
                  <div className="py-8 text-sm text-slate-500">등록된 공지사항을 불러오는 중입니다.</div>
                ) : (
                  notices.map((notice) => (
                    <Link key={notice.id} href={`/notices/${notice.id}`} className="group flex items-center gap-4 py-4" data-testid={`link-notice-${notice.id}`}>
                      <span className={`shrink-0 rounded-sm px-2 py-1 text-[11px] font-bold ${notice.isImportant ? "bg-[#2156D9] text-white" : "bg-slate-100 text-slate-600"}`}>
                        {notice.isImportant ? "중요" : "공지"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-800 group-hover:text-[#2156D9]">{notice.title}</span>
                      <span className="hidden shrink-0 items-center gap-1 text-xs text-slate-500 sm:flex">
                        <CalendarDays className="h-3.5 w-3.5" /> {notice.date}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article>
              <div className="mb-5 flex items-end justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <p className="mb-1 text-xs font-bold tracking-[0.16em] text-[#2156D9]">RESOURCES</p>
                  <h2 className="text-2xl font-extrabold tracking-[-0.03em]">자료실</h2>
                </div>
                <Link href="/photos" className="inline-flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-[#2156D9]">
                  전체보기 <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="divide-y divide-slate-200">
                {resources.map((resource) => {
                  const content = (
                    <>
                      <span className="shrink-0 rounded-sm bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{resource.label}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-800 group-hover:text-[#2156D9]">{resource.title}</span>
                      {resource.external ? <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                    </>
                  );
                  return resource.external ? (
                    <a key={resource.title} href={resource.href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 py-4">{content}</a>
                  ) : (
                    <Link key={resource.title} href={resource.href} className="group flex items-center gap-4 py-4">{content}</Link>
                  );
                })}
              </div>
            </article>
          </div>
        </section>

        <section id="site-menu" className="scroll-mt-32 border-y border-slate-200 bg-slate-50" aria-label="주요 메뉴">
          <div className="mx-auto grid max-w-[1200px] grid-cols-2 px-5 sm:grid-cols-3 sm:px-8 lg:grid-cols-6 lg:px-10">
            {quickLinks.map((item) => {
              const body = (
                <>
                  <item.icon className="h-6 w-6 text-[#2156D9] transition-transform duration-200 group-hover:-translate-y-0.5" />
                  <span className="text-sm font-bold text-slate-800 sm:text-[15px]">{item.title}</span>
                  {item.external && <ExternalLink className="h-3.5 w-3.5 text-slate-400" />}
                </>
              );
              const className = "group flex min-h-24 items-center justify-center gap-3 border-b border-r border-slate-200 px-3 transition-colors hover:bg-white sm:min-h-28 lg:border-b-0";
              return item.external ? (
                <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer" className={className}>{body}</a>
              ) : (
                <Link key={item.title} href={item.href} className={className} data-testid={`quick-${item.title}`}>{body}</Link>
              );
            })}
          </div>
        </section>

        <section className="bg-slate-50 py-18 lg:py-24" aria-labelledby="program-title">
          <div className="mx-auto max-w-[1200px] px-5 sm:px-8 lg:px-10">
            <div className="mb-10 max-w-3xl">
              <p className="mb-3 text-sm font-extrabold tracking-[0.16em] text-[#2156D9]">DEPARTMENT OF DATA SCIENCE</p>
              <h2 id="program-title" className="text-3xl font-black leading-tight tracking-[-0.04em] text-slate-900 sm:text-4xl">학문과 산업을 잇는 데이터 융합 교육</h2>
              <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">기술적 분석 능력과 비즈니스 통찰을 함께 갖춘 연구자와 실무형 인재의 성장을 지원합니다.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {programs.map((program, index) => (
                <motion.article
                  key={program.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                  className="rounded-[10px] border border-slate-200 bg-white p-7 shadow-[0_8px_28px_rgba(15,35,64,0.06)]"
                >
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-blue-50 text-[#2156D9]">
                    <program.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-extrabold tracking-[-0.02em]">{program.title}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-slate-600">{program.description}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 lg:py-20">
          <div className="mx-auto max-w-[1200px] px-5 sm:px-8 lg:px-10">
            <div className="flex flex-col justify-between gap-7 rounded-[10px] bg-[#2156D9] px-7 py-9 text-white shadow-[0_18px_45px_rgba(33,86,217,0.20)] sm:px-10 lg:flex-row lg:items-center">
              <div>
                <p className="text-sm font-bold text-blue-100">DANKOOK GRADUATE SCHOOL</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] sm:text-3xl">데이터 전문가의 다음 도전을 시작하세요</h2>
                <p className="mt-3 text-base text-blue-100">교육과정과 연구 분야를 살펴보고 대학원 모집요강을 확인하세요.</p>
              </div>
              <Button asChild size="lg" className="h-12 shrink-0 rounded-md bg-white px-7 font-bold text-[#1746b8] hover:bg-blue-50">
                <Link href="/admissions/guidelines">모집요강 확인 <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
