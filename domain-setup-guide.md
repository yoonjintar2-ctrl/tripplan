# 여행계획닷컴 주소 연결 안내

연결 예시: https://trip.jintar.co.kr/
`trip`은 제안 이름입니다. 다른 이름을 쓰려면 아래의 `trip`을 모두 같은 이름으로 바꾸세요.
현재 확인한 코드: yoonjintar2-ctrl/tripplan 저장소, GitHub Actions가 dist 폴더를 GitHub Pages로 배포, Supabase Google 로그인.
이 안내는 설정 방법이며, DNS·GitHub·Supabase·Google Cloud의 실제 설정은 아직 변경하지 않았습니다.

## 1. 수정 파일부터 업로드

1. tripplan-final-update.zip을 압축 해제합니다. ZIP 자체를 GitHub에 올리지 마세요.
2. 기존 저장소의 Code 화면에서 main 브랜치 → Add file → Upload files.
3. 압축을 푼 폴더 안의 dist, docs, tests, tools 폴더와 package.json을 저장소 최상위에 드래그합니다. 폴더 구조를 유지하고 같은 이름의 파일을 덮어씁니다. 기존 파일이나 폴더는 삭제하지 마세요.
4. Commit changes 후 Actions의 Deploy travel planner to GitHub Pages가 성공하는지 확인합니다.
5. 이번 패키지는 기존 사이트가 있는 저장소에 덮어쓰는 누적 수정본입니다. 400개 캐릭터 등 기존 전체 자산을 새로 담은 빈 저장소용 전체본은 아닙니다. READ-ME와 이 안내서는 업로드하지 않아도 됩니다.

## 2. 새 주소에서 로그인과 지도 사용을 먼저 허용

### Supabase 로그인

프로젝트 `jiaqobfriamuxtvxhrls` → Authentication → URL Configuration.
Redirect URLs에 다음 두 항목을 추가합니다. 이전 주소는 전환 확인 전까지 유지하세요.

- `https://trip.jintar.co.kr/`
- `https://trip.jintar.co.kr/?*` (공유 일정의 trip·invite 쿼리 유지용)

Site URL은 새 주소 연결이 완료된 5단계에서 `https://trip.jintar.co.kr/`로 바꿉니다.
앱 코드는 현재 접속 주소를 기준으로 로그인 후 돌아오므로 로그인 코드의 주소를 따로 고칠 필요는 없습니다.

공식 문서: [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

### Google 로그인 OAuth

Google Cloud → Google Auth Platform → Clients에서 현재 Supabase에 연결된 웹 OAuth 클라이언트를 엽니다. 콘솔에 따라 APIs & Services → Credentials → OAuth 2.0 Client IDs로 표시됩니다.

- Authorized JavaScript origins에 `https://trip.jintar.co.kr` 추가.
- Authorized redirect URIs의 `https://jiaqobfriamuxtvxhrls.supabase.co/auth/v1/callback`은 유지. 이것을 새 사이트 주소로 바꾸지 마세요. Google은 먼저 Supabase로 돌아오고, Supabase가 사이트로 돌려보냅니다.
- Branding의 홈페이지·개인정보처리방침 URL이 기존 사이트 주소라면 해당 페이지를 새 주소에서 확인한 뒤 변경합니다. Authorized domains가 필요한 경우 루트 도메인 `jintar.co.kr`을 사용합니다.

공식 문서: [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google)

### Google 지도 API 키

Google Cloud → APIs & Services → Credentials → 현재 사이트에서 쓰는 Maps API key → Application restrictions: Websites.
아래 허용 항목을 추가하고 기존 허용 항목은 전환 확인 전까지 유지합니다.

- `https://trip.jintar.co.kr`
- `https://trip.jintar.co.kr/*`

공식 문서: [Google Maps 키 제한](https://developers.google.com/maps/api-security-best-practices)

### 구글 지도 짧은 링크 해석 함수 — 꼭 확인

현재 저장소의 `supabase/functions/resolve-maps-link/index.ts`는 ALLOWED_ORIGINS 목록으로 호출 주소를 제한합니다. GitHub에 프론트 파일을 업로드해도 Supabase 함수가 자동 배포되지는 않습니다.

Supabase → Edge Functions → resolve-maps-link의 코드 편집 화면에서 기존 ALLOWED_ORIGINS 배열에 `"https://trip.jintar.co.kr"`을 추가한 뒤 함수를 다시 배포하세요. 기존 주소와 함수의 인증 설정은 유지합니다. 다른 하위 도메인으로 정했다면 그 주소를 넣으세요.

현재 배열에 새 주소를 넣은 예시:

```ts
const ALLOWED_ORIGINS = new Set([
  SITE_ORIGIN,
  "https://yoonjintar0-commits.github.io",
  "https://yoonjintar2-ctrl.github.io",
  "https://trip.jintar.co.kr",
]);
```

이 단계를 빠뜨리면 사이트와 일반 장소 검색은 열려도 maps.app.goo.gl 같은 짧은 링크를 붙여넣을 때 403 오류가 날 수 있습니다. 안내의 함수 설정은 로컬 코드 검토에 근거하며 실제 배포본과 비교해 반영하세요.

## 3. GitHub에 사용할 주소 등록

[저장소 Pages 설정](https://github.com/yoonjintar2-ctrl/tripplan/settings/pages) → Custom domain에 `trip.jintar.co.kr` 입력 → Save.
`https://`나 `/tripplan`은 붙이지 않습니다.

현재 프로젝트는 GitHub Actions 배포 방식이므로 배포 Source는 GitHub Actions로 유지합니다. CNAME 파일을 업로드하는 것만으로는 이 설정을 대신할 수 없습니다. 이 배포 방식에서는 CNAME 파일이 필요하지 않습니다.

## 4. jintar.co.kr의 DNS 관리 화면에서 추가

도메인을 구매한 곳 또는 현재 네임서버를 관리하는 곳의 DNS 관리에 아래 레코드를 추가합니다.

| 항목 | 입력값 |
|---|---|
| 종류 / Type | CNAME |
| 호스트 / Name | trip |
| 대상 / Value | yoonjintar2-ctrl.github.io |
| TTL | 기본값 |

관리 화면이 전체 이름을 요구하면 호스트에 `trip.jintar.co.kr`을 입력합니다.
대상에는 `https://`나 `/tripplan`을 붙이지 않습니다. 루트 `jintar.co.kr`이나 `www`의 기존 레코드는 이 하위 도메인 연결을 위해 바꿀 필요가 없습니다.
같은 `trip` 이름의 기존 A/AAAA/CNAME이 있다면 현재 사용처를 확인하고 교체해야 합니다.

GitHub 등록을 먼저 하고 DNS를 추가하는 순서를 지키세요. DNS 전파와 HTTPS 준비에는 최대 24시간이 걸릴 수 있습니다.
공식 문서: [GitHub Pages 하위 도메인 연결](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## 5. HTTPS와 로그인 기본 주소 마무리

GitHub Pages에서 DNS check가 통과하고 인증서가 준비되면 Enforce HTTPS를 켭니다.
새 주소 `https://trip.jintar.co.kr/`에 접속해 사이트가 보이는지 확인합니다. `/tripplan`은 붙이지 않습니다.
이제 Supabase → Authentication → URL Configuration의 Site URL을 `https://trip.jintar.co.kr/`로 변경합니다.

## 6. 공유 썸네일 주소 정리

새 주소가 열린 뒤 저장소 `dist/index.html`의 og:image 주소를 다음 값으로 바꿉니다.

```html
<meta property="og:image" content="https://trip.jintar.co.kr/assets/captain/share.jpg">
```

원하면 head에 아래 항목도 추가합니다.

```html
<meta property="og:url" content="https://trip.jintar.co.kr/">
<link rel="canonical" href="https://trip.jintar.co.kr/">
```

이번 수정 패키지는 도메인 이름이 아직 확정되지 않아 기존 og:image 주소를 유지합니다. 변경 후 Commit하면 Actions가 다시 배포합니다. 카카오톡 공유 썸네일은 캐시 때문에 즉시 바뀌지 않을 수 있습니다.

## 7. 실제 사용 확인

- PC에서 큰 화면의 캡틴, 601–1279px에서 숨김, 모바일에서 작은 빼꼼 배치를 확인.
- 로그인 버튼 → Google 로그인 → 새 도메인으로 복귀하는지 확인.
- 기존 여행 불러오기, 새 일정 저장, 장소 검색, 지도 표시, 공유 링크 열기를 확인.
- maps.app.goo.gl 짧은 링크 붙여넣기가 되는지 확인.
- 기존 도메인과 새 도메인은 브라우저 저장 공간이 달라 처음에는 다시 로그인해야 할 수 있습니다. 같은 Supabase 프로젝트와 같은 Google 계정을 쓰면 서버에 저장된 여행은 그대로 사용합니다. 로그인 없이 로컬에만 저장한 초안은 별도입니다.

검증 범위: 로컬 npm test 전체 통과. DNS 전환 후의 실제 로그인·지도 API·짧은 링크 및 브라우저 실화면 확인은 위 절차에 따라 진행해야 합니다.
