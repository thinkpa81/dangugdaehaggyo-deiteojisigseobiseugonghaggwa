import { Link } from "wouter";
import { MapPin, Phone, ExternalLink, Building } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-slate-800 to-slate-900 text-slate-300">
      <div className="container mx-auto px-4 py-14 lg:py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 lg:gap-12">
          <div>
            <h3 className="font-bold text-white mb-5 text-lg">단국대학교 대학원</h3>
            <p className="text-slate-400 text-base leading-relaxed mb-6">
              데이터 관리 및 분석 기술과 비즈니스 마인드를 기반으로 
              사회 전 분야에 융합 적용이 가능한 미래 인재를 양성합니다.
            </p>
            <div className="flex flex-col gap-3 text-base">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building className="w-4 h-4 text-blue-400" />
                </div>
                <span className="pt-1">대학원동 301호</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4 text-blue-400" />
                </div>
                <span>031-8005-2214</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4 text-blue-400" />
                </div>
                <span>통합콜센터 : 1899-3700</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-white mb-5 text-lg">바로가기</h3>
            <ul className="space-y-3 text-base">
              <li>
                <Link href="/about" className="hover:text-blue-400 transition-colors flex items-center gap-2 group" data-testid="footer-link-about">
                  <span className="w-1 h-1 bg-blue-500 rounded-full group-hover:w-2 transition-all" />
                  학과 소개
                </Link>
              </li>
              <li>
                <Link href="/notices" className="hover:text-blue-400 transition-colors flex items-center gap-2 group" data-testid="footer-link-notices">
                  <span className="w-1 h-1 bg-blue-500 rounded-full group-hover:w-2 transition-all" />
                  공지사항
                </Link>
              </li>
              <li>
                <Link href="/papers" className="hover:text-blue-400 transition-colors flex items-center gap-2 group" data-testid="footer-link-papers">
                  <span className="w-1 h-1 bg-blue-500 rounded-full group-hover:w-2 transition-all" />
                  논문
                </Link>
              </li>
              <li>
                <Link href="/regulations" className="hover:text-blue-400 transition-colors flex items-center gap-2 group" data-testid="footer-link-regulations">
                  <span className="w-1 h-1 bg-blue-500 rounded-full group-hover:w-2 transition-all" />
                  학과 내규
                </Link>
              </li>
              <li>
                <Link href="/admissions/guidelines" className="hover:text-blue-400 transition-colors flex items-center gap-2 group" data-testid="footer-link-admissions">
                  <span className="w-1 h-1 bg-blue-500 rounded-full group-hover:w-2 transition-all" />
                  입학안내 · 모집요강
                </Link>
              </li>
              <li>
                <Link href="/photos" className="hover:text-blue-400 transition-colors flex items-center gap-2 group" data-testid="footer-link-photos">
                  <span className="w-1 h-1 bg-blue-500 rounded-full group-hover:w-2 transition-all" />
                  사진자료실
                </Link>
              </li>
              <li>
                <a
                  href="https://drive.google.com/drive/folders/1WoLoXcT7wRbpyxldRxXyyMKYTuZR0k4L?usp=drive_link"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  data-testid="footer-link-shared-resources"
                >
                  <span className="w-1 h-1 bg-blue-500 rounded-full group-hover:w-2 transition-all" />
                  공유자료실 <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-white mb-5 text-lg">캠퍼스 안내</h3>
            <ul className="space-y-3 text-base">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="font-medium text-white">죽전캠퍼스</p>
                  <p className="text-slate-400">경기도 용인시 수지구 죽전로 152 (우)16890</p>
                </div>
              </li>
            </ul>
            <div className="mt-6 pt-4 border-t border-slate-700">
              <h4 className="font-medium text-white mb-2 text-base">관련 사이트</h4>
              <a 
                href="https://grad.dankook.ac.kr/grad" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-blue-400 transition-colors flex items-center gap-2 text-base"
                data-testid="footer-link-dankook"
              >
                단국대학교 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700/50 mt-12 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-base text-slate-500">
            <p>Copyright (C) DANKOOK UNIVERSITY All rights reserved.</p>
            <p className="text-sm">본 사이트는 방문자 개인정보 입력·수집 양식을 운영하지 않습니다.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
