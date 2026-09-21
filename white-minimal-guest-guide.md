# 화이트미니멀 지도 및 게스트 일정 수정본

## 코드에 반영한 내용
- 메인 지도와 일정 추가/수정 지도에 화이트미니멀 스타일 적용: 흰 도로, 연회색 건물, 옅은 회녹색 공원, 회청색 물, 짙은 회색 글자. 일반 상점 표시는 줄이고 역·공원·주요 관광지 이름은 유지합니다.
- Google StyledMapType을 등록해서 사용합니다. 기존 캡틴·깃발·동선 코드는 유지하며 화면 전체에 색상 필터를 씌우지 않습니다.
- 첫 화면에서 여행 관리 메뉴를 거치지 않고 ‘일정 추가’를 눌러도 게스트 계획을 먼저 준비합니다.
- 로그인 상태 조회가 늦게 끝나더라도 이미 입력 중인 게스트 계획을 초기화하지 않습니다.
- 로그인 상태 조회가 예외로 실패해도 게스트 시작 처리를 진행합니다.
- crypto.randomUUID가 없는 환경에서도 보안 난수 기반 UUID로 여행·일정·동행 ID를 만들 수 있게 했습니다.
- 로그인은 HTTPS에서 시작하도록 안내합니다. 임시 계획 저장 형식과 기존 계정 이전 처리는 유지합니다.
- 샘플 여행과 타인 공유 여행은 읽기 전용을 유지합니다.

## 적용
ZIP을 풀고 내부 파일/폴더를 기존 GitHub 저장소 최상위에 덮어씁니다. dist 폴더의 파일들은 기존 dist에 들어가야 합니다. GitHub Actions 배포 완료 후 Ctrl+Shift+R로 새로고침하세요. 지도 디자인은 추가 파일이나 별도 스타일 ID 입력 없이 코드에서 설정합니다. 실제 지도 렌더링은 배포 후 확인해야 합니다.

## 이번에 테스트한 범위
- 초기 로그인 상태 조회가 끝나기 전 ‘일정 추가’ 직접 클릭
- crypto.randomUUID가 없는 상태에서 여행 및 일정 생성
- 입력 중 로그인 상태 조회 완료 → 입력 내용 유지
- 여행 이름 저장, 일정 추가·수정, 메모 및 비용 저장
- 지도에서 선택한 장소로 일정 편집창 열기
- 저장 내용 및 미완성 입력의 재초기화/새로고침 상황 복원
- 샘플 여행 보기 및 원래 계획으로 복귀
- 모의 Google 인증 후 기존 게스트 여행·일정을 계정에 한 번만 저장
- 저장 실패 재시도·중복 이전 방지·다른 계정으로의 잘못된 이전 차단
- 메인 지도와 편집 지도의 동일한 스타일 등록
- 기존 캐릭터/지도 상호작용 회귀 테스트

모든 자동 테스트가 통과했습니다. DOM 통합 테스트와 모의 Google Maps/Supabase를 사용했습니다. 운영 브라우저 테스트는 현재 도메인의 인증서 오류로 막혀 끝까지 수행하지 못했고, 실제 Google 로그인·운영 계정 저장 및 지도 색상 렌더링은 미검증입니다.

## 남아 있는 운영 설정: HTTPS와 로그인 복귀 주소
이번 점검에서 GitHub 기본 주소가 http://trip.jintar.co.kr/로 리디렉션하는 것을 확인했습니다. HTTPS 주소는 테스트 브라우저에서 Certificate verify failed: hostname mismatch 오류가 났습니다. 사용자 브라우저의 인증서 상태와 GitHub Pages 설정에서 최종 확인이 필요합니다.

또한 사용자 첨부 화면은 Google 로그인 후 예전 morrow-trip-planner.yoonjintar0.chatgpt.site로 돌아간 상태였습니다. 새 사이트 코드의 redirectTo는 로그인 시작 주소를 사용합니다. Supabase의 Site URL 및 허용된 Redirect URLs가 일치하는지 확인해야 합니다. 서버 설정에 접근하지 못했으므로 이번 ZIP만으로 예전 주소 문제가 해결됐다고 볼 수 없습니다.

### 1. GitHub HTTPS
저장소 yoonjintar2-ctrl/tripplan → Settings → Pages에서 다음을 확인합니다.
- Custom domain: trip.jintar.co.kr
- DNS 검사 및 인증서 발급 상태
- 인증서가 준비되면 Enforce HTTPS 활성화
- 도메인의 trip CNAME 대상이 yoonjintar2-ctrl.github.io인지 확인

### 2. Supabase 복귀 URL
프로젝트 ref jiaqobfriamuxtvxhrls → Authentication → URL Configuration:

Site URL:
```
https://trip.jintar.co.kr/
```
Redirect URLs에 추가할 주소:
```
https://trip.jintar.co.kr/
https://trip.jintar.co.kr/\?*
```
두 번째 패턴은 공유 링크의 쿼리 문자열을 포함한 복귀를 허용합니다. 예전 주소를 더 이상 사용하지 않는 경우에만 그 항목을 제거합니다.

Google Cloud의 OAuth 리디렉션 URI는 계속 아래 Supabase 콜백을 사용합니다.
```
https://jiaqobfriamuxtvxhrls.supabase.co/auth/v1/callback
```
설정 완료 후 정상 HTTPS 운영 사이트에서 로그인을 새로 시작하세요. 예전 코드가 붙은 URL을 재사용하지 마세요. HTTP와 HTTPS 및 서로 다른 호스트는 임시 계획을 자동 공유하지 않습니다. 기존 계획이 있는 주소의 브라우저 데이터를 삭제하지 마세요.

Supabase 관리자 로그인은 자동 승인 검토가 명시적 관리자 로그인 승인이 없다는 이유로 차단했습니다. 운영 설정은 아직 변경하지 않았습니다. 관리자 로그인 및 위 복귀 주소 수정 승인 후 이어서 확인할 수 있습니다. 비밀번호나 인증 코드를 대화에 보내지 마세요.

공식 문서:
- https://developers.google.com/maps/documentation/javascript/examples/maptype-styled-simple
- https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
- https://supabase.com/docs/guides/auth/redirect-urls
