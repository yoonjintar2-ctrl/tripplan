# GitHub 분할 업로드 안내

대상: https://github.com/yoonjintar2-ctrl/tripplan
기준: main / e2a193cf050caa31a7c1bb8b275bc927373d30dd

이번 묶음은 기존 저장소에 추가/덮어쓸 변경 파일입니다. 이전에 요청한 캡틴비어 UI, 무채색 화면, 지도 장소 선택, 시간 선택, 아이콘·여행지 입력 제거 변경을 포함합니다. 기존 저장소를 지우거나 새로 만들 필요가 없습니다.

## 업로드 순서

1. tripplan-01-male-001-100.zip: 남성 캐릭터 001~100, 100개 파일.
2. tripplan-02-male-101-200.zip: 남성 캐릭터 101~200, 100개 파일.
3. tripplan-03-female-001-100.zip: 여성 캐릭터 001~100, 100개 파일.
4. tripplan-04-female-101-200.zip: 여성 캐릭터 101~200, 100개 파일.
5. tripplan-05-site-update.zip: 사이트 코드·가이드 이미지·설정·문서. 마지막에 업로드합니다.

각 ZIP을 서로 다른 폴더에 압축 해제합니다. 모두 한 폴더에 합치면 다시 100개 제한에 걸립니다.

매번 GitHub 저장소 첫 화면(main, README.md와 dist 폴더가 보이는 위치)에서 Add file → Upload files를 누릅니다.
1~4번은 압축 해제된 폴더 안의 dist 폴더를 업로드 화면에 드래그한 뒤 Commit changes를 누릅니다. 바깥쪽 tripplan-01-… 폴더나 ZIP 자체를 올리지 않습니다. 업로드 목록이 dist/assets/avatars-clay/male-001.webp 같은 경로인지 확인합니다.
5번은 압축 해제된 폴더 안의 모든 항목(.github, dist, docs, examples, tests 폴더 및 루트 파일)을 함께 드래그하고 Commit changes를 누릅니다.
매 묶음마다 Commit changes를 완료한 후 저장소 첫 화면으로 돌아와 다음 묶음을 업로드합니다.

5번 업로드 후 Actions에서 마지막 Deploy travel planner to GitHub Pages 실행이 녹색으로 완료되면 사이트를 새로고침합니다. PC에서는 Ctrl+Shift+R로 새 이미지를 다시 불러올 수 있습니다.

## 캐릭터 수정

400종 모두 모자·안경·장신구 없이, 검정/짙은 갈색 계열 머리와 회색 기본 라운드넥 상의를 적용했습니다. 헤어스타일, 얼굴형, 눈썹, 눈, 코, 입과 표정으로 차이를 주었습니다. 캡틴비어와 같은 밝은 살구색 피부·무광 3D 찰흙 스타일이며, 가이드 캡틴비어의 빨간 모자는 유지합니다.
기존 male-001~200 / female-001~200 번호는 그대로입니다.

## 확인 범위

400개 이미지 디코딩·크기·경로·중복 파일 검사와 기존 애플리케이션 테스트를 통과했습니다. ZIP당 파일 수는 100개 이하입니다. 실제 로그인·Google 지도 연동 화면은 배포 후 확인해야 합니다.
GitHub 직접 전송은 파일 1개 단계에서 403 Resource not accessible by integration으로 거절되어 이번 수정본은 아직 배포되지 않았습니다.
