import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, LogOut, Menu, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import dkuLogo from "@assets/image_1767877726952.png";
import { api } from "@/lib/api";
import { notifyAuthChanged, useSession } from "@/hooks/use-session";

type NavItem = {
  title: string;
  href: string;
  external?: boolean;
  children?: NavItem[];
};

const navItems: NavItem[] = [
  { title: "학과 소개", href: "/about" },
  { title: "공지사항", href: "/notices" },
  {
    title: "논문",
    href: "/papers",
    children: [
      { title: "학술대회", href: "/papers/conference" },
      { title: "저널", href: "/papers/journal" },
    ],
  },
  { title: "학과 내규", href: "/regulations" },
  {
    title: "입학안내",
    href: "/admissions/guidelines",
    children: [
      { title: "모집요강", href: "/admissions/guidelines" },
    ],
  },
  {
    title: "자료",
    href: "/photos",
    children: [
      { title: "사진자료실", href: "/photos" },
      {
        title: "공유자료실",
        href: "https://drive.google.com/drive/folders/1WoLoXcT7wRbpyxldRxXyyMKYTuZR0k4L?usp=drive_link",
        external: true,
      },
    ],
  },
];

export default function Header() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user: sessionUser } = useSession();

  const isActiveHref = (href: string) =>
    !href.startsWith("http") && (location === href || (href !== "/" && location.startsWith(`${href}/`)));

  const movePageToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };

  const handleMobileInternalLink = () => {
    setMobileOpen(false);
    window.requestAnimationFrame(movePageToTop);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      notifyAuthChanged();
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,35,64,0.05)]">
      <div className="hidden border-b border-slate-200 bg-slate-50 md:block">
        <div className="mx-auto flex h-8 max-w-[1200px] items-center justify-end gap-5 px-8 text-xs font-semibold text-slate-600 lg:px-10">
          {sessionUser?.role === "ADMIN" ? (
            <>
              <Link href="/admin" className="transition-colors hover:text-[#2156D9]">관리자</Link>
              <button type="button" onClick={() => void handleLogout()} className="transition-colors hover:text-[#2156D9]" data-testid="button-logout">로그아웃</button>
            </>
          ) : (
            <Link href="/admin" className="transition-colors hover:text-[#2156D9]" data-testid="link-admin-login">관리자 로그인</Link>
          )}
          <a href="/#site-menu" className="transition-colors hover:text-[#2156D9]">사이트맵</a>
        </div>
      </div>

      <div className="mx-auto flex h-[78px] max-w-[1200px] items-center justify-between px-5 sm:px-8 lg:h-[84px] lg:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-3 lg:gap-4" data-testid="link-home">
          <img src={dkuLogo} alt="단국대학교" className="h-9 w-auto shrink-0 object-contain sm:h-10" />
          <span className="hidden h-9 w-px bg-slate-300 sm:block" aria-hidden="true" />
          <span className="hidden min-w-0 sm:block">
            <span className="block text-[11px] font-bold tracking-[0.13em] text-[#2156D9]">일반대학원</span>
            <span className="mt-0.5 block whitespace-nowrap text-[15px] font-extrabold tracking-[-0.02em] text-slate-900 lg:text-base">데이터지식서비스공학과</span>
            <span className="mt-0.5 block whitespace-nowrap text-[10px] font-medium tracking-[-0.01em] text-slate-500 lg:text-[11px]">
              AIMS Lab(에임즈 랩) : AI, Innovation, Metaverse &amp; Service Lab
            </span>
          </span>
        </Link>

        <nav className="hidden items-stretch self-stretch xl:flex" aria-label="주요 메뉴">
          {navItems.map((item) => {
            const active = item.children
              ? isActiveHref(item.href) || item.children.some((child) => isActiveHref(child.href))
              : isActiveHref(item.href);
            const baseClass = `relative flex h-full items-center border-b-[3px] px-4 pt-[3px] text-[15px] font-bold transition-colors ${active ? "border-[#2156D9] text-[#2156D9]" : "border-transparent text-slate-700 hover:border-slate-300 hover:text-[#2156D9]"}`;

            if (item.children) {
              return (
                <DropdownMenu key={item.title}>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={baseClass} data-testid={`nav-${item.title}`}>
                      {item.title}<ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 rounded-md border-slate-200 p-2 shadow-xl">
                    {item.children.map((child) => (
                      <DropdownMenuItem key={child.title} asChild className="rounded-sm py-2.5">
                        {child.external ? (
                          <a
                            href={child.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer font-medium"
                            data-testid={`nav-${child.title}`}
                          >
                            {child.title}
                          </a>
                        ) : (
                          <Link
                            href={child.href}
                            className={`cursor-pointer font-medium ${isActiveHref(child.href) ? "text-[#2156D9]" : ""}`}
                            aria-current={isActiveHref(child.href) ? "page" : undefined}
                            data-testid={`nav-${child.title}`}
                          >
                            {child.title}
                          </Link>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            if (item.external) {
              return <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer" className={baseClass} data-testid={`nav-${item.title}`}>{item.title}</a>;
            }

            return <Link key={item.title} href={item.href} className={baseClass} data-testid={`nav-${item.title}`}>{item.title}</Link>;
          })}
        </nav>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="xl:hidden">
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-md border-slate-300" data-testid="button-menu" aria-label="전체 메뉴 열기">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[88vw] max-w-sm overflow-y-auto p-6">
            <SheetTitle className="sr-only">전체 메뉴</SheetTitle>
            <div className="mt-3 border-b border-slate-200 pb-6">
              <img src={dkuLogo} alt="단국대학교" className="h-9 w-auto" />
              <p className="mt-3 text-sm font-extrabold text-slate-800">일반대학원 데이터지식서비스공학과</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                AIMS Lab(에임즈 랩) : AI, Innovation, Metaverse &amp; Service Lab
              </p>
            </div>

            <nav className="mt-5 flex flex-col" aria-label="모바일 주요 메뉴">
              {navItems.map((item) => {
                const active = item.children
                  ? isActiveHref(item.href) || item.children.some((child) => isActiveHref(child.href))
                  : isActiveHref(item.href);
                return (
                <div key={item.title} className="border-b border-slate-100 py-1">
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className="block px-2 py-3 text-base font-bold text-slate-800" data-testid={`mobile-nav-${item.title}`}>{item.title}</a>
                  ) : (
                    <Link href={item.href} onClick={handleMobileInternalLink} className={`block px-2 py-3 text-base font-bold ${active ? "text-[#2156D9]" : "text-slate-800"}`} data-testid={`mobile-nav-${item.title}`}>{item.title}</Link>
                  )}
                  {item.children && (
                    <div className="mb-2 grid grid-cols-1 gap-1 rounded-md bg-slate-50 p-2">
                      {item.children.map((child) => (
                        child.external ? (
                          <a
                            key={child.title}
                            href={child.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setMobileOpen(false)}
                            className="rounded-sm px-2 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-[#2156D9]"
                            data-testid={`mobile-nav-${child.title}`}
                          >
                            {child.title}
                          </a>
                        ) : (
                          <Link
                            key={child.title}
                            href={child.href}
                            onClick={handleMobileInternalLink}
                            className={`rounded-sm px-2 py-2 text-sm font-medium hover:bg-white hover:text-[#2156D9] ${isActiveHref(child.href) ? "bg-white text-[#2156D9]" : "text-slate-600"}`}
                            aria-current={isActiveHref(child.href) ? "page" : undefined}
                            data-testid={`mobile-nav-${child.title}`}
                          >
                            {child.title}
                          </Link>
                        )
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </nav>

            <div className="mt-6 grid gap-2">
              <Button variant="outline" className="h-11 w-full rounded-md font-bold" asChild>
                <Link href="/admin" onClick={handleMobileInternalLink} data-testid="mobile-link-admin">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {sessionUser?.role === "ADMIN" ? "관리자" : "관리자 로그인"}
                </Link>
              </Button>
              {sessionUser?.role === "ADMIN" && (
                <Button variant="outline" className="h-11 w-full rounded-md font-bold" onClick={() => { setMobileOpen(false); void handleLogout(); }}>
                  <LogOut className="mr-2 h-4 w-4" />로그아웃
                </Button>
              )}
            </div>

          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
