# Morrow Airy — GitHub 업로드 안내

## 들어 있는 내용
- dist/: 실제 사이트 전체, CSS/JavaScript, 캐릭터 400종과 이미지
- .github/workflows/pages.yml: main에 업로드하면 dist를 GitHub Pages로 배포
- supabase/: 기존 데이터베이스 변경 이력과 지도 단축 링크 해석 함수
- tests/: 일정 참석자·정산·지도 URL 처리 검증

수정 코드 기준: 63e8ce09ce45541a9f1eaba19500361002eb61bb

## 1. GitHub에 올리기
대상 저장소: https://github.com/yoonjintar/morrow-trip-planner

ZIP 자체를 저장소에 올리는 것이 아니라 압축을 풀고 그 안의 파일과 폴더를 올립니다.
저장소 최상단에 dist, tests, supabase, .github 폴더가 바로 위치해야 합니다.
캐릭터 파일이 많으므로 GitHub Desktop이나 기존에 사용하시던 개발 도구에서 업로드하는 편이 편합니다.

GitHub Desktop을 사용할 경우:
1. 대상 저장소를 컴퓨터에 Clone합니다.
2. 압축을 푼 내용물을 Clone한 저장소 폴더 안으로 복사합니다. README는 교체합니다.
3. .github 폴더도 반드시 포함됐는지 확인합니다.
4. 변경 내용을 Commit to main 한 다음 Push origin을 누릅니다.

## 2. 웹사이트 공개
저장소 Settings → Pages → Source를 GitHub Actions로 선택합니다.
이 저장소에는 이미 위 설정이 적용돼 있습니다.
Actions에서 Deploy travel planner to GitHub Pages가 성공하면 Pages에 실제 주소가 표시됩니다.
예상 주소: https://yoonjintar.github.io/morrow-trip-planner/
현재 이 패키지는 아직 GitHub에 업로드되거나 배포되지 않았습니다.

## 3. 새 주소에서 로그인·지도를 사용하기 위한 설정
기존 Supabase 프로젝트를 계속 사용합니다. 기존 사이트 데이터는 유지됩니다.
현재 프런트엔드는 기존 프로젝트의 공개 클라이언트 설정을 사용합니다.

A. Supabase Dashboard → Authentication → URL Configuration:
Redirect URLs에 https://yoonjintar.github.io/morrow-trip-planner/ 를 추가합니다.
공유 링크처럼 쿼리 문자열이 포함되는 주소도 돌아올 수 있도록 해당 경로 아래의
허용 패턴을 설정에서 확인합니다. 기존 주소는 삭제하지 않습니다.
로그인 후 기존 사이트로 돌아가면 이 허용 목록을 먼저 확인하세요.

B. Google Cloud의 사용 중인 Maps 브라우저 API 키 설정:
웹사이트 제한(HTTP referrers)에 https://yoonjintar.github.io/* 를 추가합니다.
Maps JavaScript API와 Places API를 기존과 동일하게 사용할 수 있어야 합니다.
기존 사이트 주소 허용 항목은 유지합니다.

C. Google Maps 단축 링크 해석 함수:
supabase/functions/resolve-maps-link/index.ts의 허용 origin 목록에
https://yoonjintar.github.io 를 추가하고 resolve-maps-link 함수를 다시 배포합니다.
현재 배포된 함수는 기존 Sites 주소와 yoonjintar0-commits.github.io를 허용합니다.
프런트엔드 파일을 GitHub에 올리는 것만으로 Supabase 함수가 갱신되지는 않습니다.
기존 프로젝트 ID: jiaqobfriamuxtvxhrls

## 4. 이미 적용한 것 / 남은 것
- Airy UI와 요청 기능 구현 완료, 로직·DOM 검증 완료.
- 기존 Supabase 프로젝트의 Airy 데이터베이스 마이그레이션 적용 완료.
  같은 프로젝트에는 migration을 수동으로 다시 실행하지 마세요.
- GitHub 공개 배포 및 위 새 주소 허용 설정은 아직 완료되지 않음.
- 실제 모바일 Safari와 PC 브라우저의 최종 시각 검수는 필요함.

## 기능상 범위
- 새 일정의 종료시간과 정산은 미설정, 지도 장소는 선택 사항입니다.
- 장소명 검색 또는 Google Maps 링크 인식 후 미니 지도에서 위치를 확인합니다.
- 참석자는 기본 전원이며 일정마다 변경할 수 있습니다.
- 지도 동선은 일정 사이를 잇는 직선과 캐릭터 이동 표시이며 도로 길찾기는 아닙니다.
- 리뷰는 Google이 제공한 일부 리뷰 중 최대 3개를 날짜순으로 보여줍니다.
- 캐릭터 저작권 표시는 dist/assets/avatars/ATTRIBUTION.md를 유지합니다.

## 다른 노트북에서 이어서 작업하기
이 패키지를 기존 로그인된 개발 도구에서 열고 위 GitHub 저장소로 Push하면 됩니다.
이전 대화의 로그인 세션은 이 패키지에 포함되지 않습니다.
.git 기록, 임시 인증키, 개인 로그인 정보는 포함하지 않았습니다.
