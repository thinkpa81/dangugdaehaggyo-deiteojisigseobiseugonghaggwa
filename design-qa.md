# Design QA — 사진자료실 목록·상세

## Source truth

- 사용자 상세 목표 화면: `/workspace/scratch/ca712d4f46c5/upload/cce13f8e-e5e8-4911-90dc-94f6ea45a612.png`
- 성균관대 목록 캡처: `/workspace/scratch/skku-photo-list-reference-1363x936.jpg`
- 성균관대 상세 캡처: `/workspace/scratch/skku-photo-detail-reference-1363x936.jpg`
- 구현 목록 최종 캡처: `/workspace/scratch/dankook-photo-list-implementation-1363x936-v3.jpg`
- 구현 상세 최종 캡처: `/workspace/scratch/dankook-photo-detail-implementation-1363x936-v2.jpg`
- 구현 모바일 목록 최종 캡처: `/workspace/scratch/dankook-photo-list-mobile-390x844-final-crop.jpg`
- 구현 모바일 상세 캡처: `/workspace/scratch/dankook-photo-detail-mobile-390x844-crop.jpg`
- 동일 입력 비교판: `/workspace/scratch/photo-list-reference-vs-implementation-v2.jpg`, `/workspace/scratch/photo-detail-reference-vs-implementation.jpg`
- 상태: 비로그인 공개 목록(현실적 개발 미리보기 앨범 10건)과 비로그인 공개 상세(사진 5장). 관리자 등록·수정·삭제 UI는 숨김.
- 데스크톱 CSS viewport는 1363×936px, DPR 1이다. 브라우저가 저장한 원본·구현 JPEG는 스크롤바 영역을 제외해 모두 1348×926px이며 별도 배율 변환 없이 비교했다.
- 모바일 구현은 동일 클라우드 브라우저 안의 390×844px browsing context를 사용해 렌더링하고 해당 영역을 390×844px로 크롭했다.

## Full-view comparison evidence

- 목록 비교판에서 기준과 구현 모두 1,200px 본문, 250px 자료실 메뉴, 약 80px 간격, 870px 갤러리 영역과 데스크톱 3열 구조를 유지하며 `제목+내용·제목·내용` 검색 범위를 제공한다.
- 구현 실측 카드 폭은 276.66px, 표지 사진은 274.66×177px이며 기준의 약 276×177px 카드 규격과 일치한다. 한 페이지 9건 뒤 숫자 페이지 이동 구조도 동일하다.
- 상세 비교판에서 기준과 구현의 메인 사진 영역은 모두 822×616.5px의 4:3 비율이며 구현 좌표는 x=428px이다. 썸네일은 210×140px, 간격 5px이다.
- 기존 단국대 사이트의 공통 헤더·캠퍼스 히어로와 Navy/Blue 브랜드 토큰은 유지했다. 기준 사이트의 Green 토큰과 전역 셸 차이는 기존 제품에 통합하기 위한 의도된 차이다.
- 실제 행사 사진이 제공되지 않았으므로 개발 미리보기는 저장소의 실제 단국대 캠퍼스 이미지를 사용한다. 운영에서는 관리자가 등록한 사진으로 동일한 4:3 프레임과 대표 이미지가 채워진다.

## Focused comparison evidence

- 상세 비교판에서 메인 사진과 썸네일 레일을 같은 픽셀 크기로 나란히 확인했다. 초기 구현의 검은 레터박스와 좌측 정렬은 최종 캡처에서 제거됐고, 기준처럼 822px 영역을 가운데 정렬해 채운다.
- 목록의 첫 카드 DOM 실측과 기준 사이트 실측을 비교해 카드 폭·사진 높이·3열 간격을 확인했다. 핵심 크기와 텍스트 2줄 제한을 판독할 수 있어 추가 확대 크롭은 필요하지 않았다.
- 390×844px 목록 캡처에서 좌우 10px 여백, 2열 카드, 모바일 헤더와 검색 컨트롤이 겹침 없이 표시된다. 상세 캡처에서도 제목·메타 정보·4:3 메인 사진이 가로 넘침 없이 표시된다.

## Required fidelity surfaces

- Fonts and typography: 기존 프로젝트의 한국어 산세리프 계열과 굵기 토큰을 유지했다. 제목은 최대 2줄, 14–15px 카드 제목, 2xl–3xl 상세 제목으로 명확한 위계를 가지며 긴 한국어 제목도 잘리지 않고 줄바꿈된다.
- Spacing and layout rhythm: 1,200/250/80/870px 데스크톱 프레임, 822px 상세 내부 폭, 210×140px 썸네일과 5px 간격을 확인했다. 모바일은 10px 외곽 여백과 10px 카드 간격을 사용한다.
- Colors and visual tokens: 기준의 구조는 따르되 기존 단국대 Navy `#0B2B50`과 Blue `#2156D9`를 활성·포커스·주요 버튼에 사용했다. 텍스트·테두리·버튼 대비는 공통 디자인 시스템을 유지한다.
- Image quality and asset fidelity: 목록은 `object-cover`, 상세는 4:3 `object-cover`로 프레임을 안정적으로 채운다. 운영 업로드는 Sharp로 회전 보정·메타데이터 제거·WebP 변환 후 2000×1500 이내로 보존된다. 커스텀 SVG·CSS 그림·가짜 이미지 플레이스홀더는 사용하지 않았다.
- Copy and content: `사진자료실`, `공유자료실`, 검색, 조회수, 사진 수, 전체·개별 다운로드, 이전·다음 앨범, 목록 문구가 독립적으로 이해되며 관리자 동작은 로그인 세션에서만 노출된다.
- Icons: 프로젝트가 이미 사용하는 Lucide 아이콘 계열로 검색·조회·달력·이동·다운로드·관리 동작을 통일했고 버튼 레이블과 함께 제공한다.
- Accessibility: 의미 있는 alt, 썸네일 button과 `aria-current`, 44px 수준 조작 영역, 방향키, 포커스 링, 자동재생 정지, `prefers-reduced-motion` 대응을 확인했다.

## Responsive and interaction QA

- 목록 1페이지에서 9건, 2페이지에서 1건 노출을 브라우저로 확인했다.
- 검색 후 빈 결과 상태와 검색 초기화를 확인했다.
- 제목 범위에서 내용 전용 검색어가 제외되고, 내용 범위에서 같은 검색어로 10건이 다시 표시되는 것을 확인했다.
- 카드 클릭으로 `/photos/110` 상세 이동을 확인했다.
- 5초 자동재생이 3/5에서 4/5로 이동하고, 일시정지 후 5.2초 동안 번호가 유지되는 것을 확인했다.
- 상세 포커스 상태에서 `ArrowRight`로 다음 사진 이동, 1번 썸네일 선택으로 1/5 이동을 확인했다.
- 관리자 비로그인 상태에서 사진 등록·수정·삭제 UI가 노출되지 않음을 목록·상세 DOM에서 확인했다.
- 모바일 390×844px 목록·상세를 브라우저로 렌더링해 2열 목록, 숨겨진 데스크톱 썸네일 레일, 가로 넘침 없는 레이아웃을 확인했다.
- `http://terminal.local:4173` 출처의 브라우저 console error는 0건이다. Chrome 확장 프로그램 자체 오류는 앱 결함에서 제외했다.

## Comparison history

- 1차 발견(P2): `/workspace/scratch/dankook-photo-detail-implementation-1363x936.jpg`에서 매우 넓은 개발 사진이 `object-contain`으로 표시돼 4:3 메인 영역에 큰 검은 레터박스가 생겼다.
- 1차 발견(P2): 상세 본문이 870px 콘텐츠 영역 왼쪽 x=404px에 붙어 기준의 822px 가운데 정렬(x≈428px)과 달랐다.
- 수정: 상세 메인 이미지를 4:3 `object-cover`로 바꾸고 불필요한 검은 배경·모서리·그림자를 제거했다.
- 수정: 제목, 메인 사진, 썸네일, 설명, 다운로드, 이전·다음, 목록 버튼을 모두 822px 가운데 정렬했다.
- 재검증: `/workspace/scratch/dankook-photo-detail-implementation-1363x936-v2.jpg`와 상세 비교판에서 822×616.5px, x=428px, 레터박스 없음, 210×140px 썸네일을 확인했다.

## Findings

- P0 결함: 없음.
- P1 결함: 없음.
- P2 결함: 없음.

## Follow-up polish

- 실제 운영 행사 사진을 첫 등록한 뒤 세로형·초광각 사진의 대표 이미지 크롭 초점만 콘텐츠별로 확인할 수 있다.

final result: passed
---

# Design QA — 관리자 자료 업로드

- Reference: 사용자가 제공한 780 × 728 논문 등록 대화상자
- Prototype: 논문 등록/수정 첨부파일 UI, 사진 앨범 등록/수정 사진 UI
- Desktop validation: 780 × 728 논문 등록 상태와 840px 사진 등록 상태
- Mobile validation: 375 × 812 논문 및 사진 등록 상태
- Interaction validation: 클릭 파일 선택, 다중 선택, 선택 파일명/용량 표시, 개별 제거, 등록/취소 동작 위치, 사진 수정 화면의 추가 파일 선택
- Access validation: 관리자 세션에서만 등록·수정·삭제 UI가 렌더링되고, 비관리자 전환 시 열린 관리자 상태와 선택 파일을 초기화
- Responsive validation: 375px 뷰포트에서 가로 넘침 없음; 긴 양식은 내부 스크롤을 사용하고 등록/취소 버튼은 하단에 고정
- Visual validation: 기존 단국대 색상·타이포그래피·입력 높이·라운드·버튼 계층을 유지하면서 첨부 영역만 확장

## Findings

- P0: none
- P1: none
- P2: none
- P3: 긴 파일명은 한 줄 말줄임으로 표시되며 전체 이름은 다운로드 응답의 원본 파일명으로 보존됨

final result: passed
