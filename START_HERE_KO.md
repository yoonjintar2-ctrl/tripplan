# 여행계획닷컴 — 현재 작업 기준

현재 최종본은 https://github.com/yoonjintar2-ctrl/tripplan 의 `main`입니다.
배포 주소: https://yoonjintar2-ctrl.github.io/tripplan/

- `dist/`: 실제 서비스 화면과 에셋. 별도 프런트엔드 빌드가 필요 없는 정적 앱입니다.
- `supabase/`: 기존 데이터베이스 이력과 지도 링크 해석 함수. 이미 적용된 SQL을 다시 실행하지 않습니다.
- `docs/brand/`: 캡틴비어 브랜드 자료와 적용 지침.
- `examples/uk-parents-5days.json`: 영국 가족 여행 예시 데이터.
- `tests/`: 입력·지도 선택·정산·로그인 복귀 등 회귀 검사.

검증: `npm ci` 후 `npm test`.
배포: `main` 변경 시 GitHub Actions가 검증 후 `dist/`를 GitHub Pages에 배포합니다.
화면 파일 배포는 Supabase Edge Function이나 데이터베이스를 변경하지 않습니다.
기존 Supabase·Google Maps 연결과 사이트 주소를 유지합니다.

이전 저장소 주소나 과거 ZIP 안내보다 현재 GitHub 코드와 README를 우선합니다.
