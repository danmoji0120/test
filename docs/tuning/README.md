# 실제 튜닝 실행 기록

최종 통과 결과는 루트 QA와 `docs/browser-qa.json`을 참조하세요. 이 폴더의 실패는 성공으로 계산하지 않습니다.

- `first-mixed-failure.json`, `first-mixed-result.png`: 12명 편성·강한 발사 빈도에서 첫 4인 혼합 무장 실행이 5:30에 전멸. SVG에서 PNG로 넘어가는 중간 실행입니다.
- `overpressure-browser.json`, `overpressure-result.png`: 중간 엄폐를 추가하고 경유점 반복 이동을 해결한 뒤에도 12명 편성이 과도하여 1:27에 전멸. 4인 편성을 8명으로 낮추고 예고 시간을 늘렸습니다.
- `escape-45s-failure.json`, `escape-45s-result.png`: 발전 장치 파괴까지 진행했지만 45초 탈출 기한과 7초 추격 간격에서 동료 둘이 쓰러져 기한 초과. 60초/12초로 조정했습니다.
- `pre-torso-fix-success.json`: 60초 탈출 설정에서 4인 혼합 무장으로 5:14 성공, 1회 소생, 재접속/재출격 통과. 최종 상체 조준 판정 수정 전에 기록했습니다.
- `old-renderer-*.png`: 전환 중의 이전 캐릭터 렌더러 화면. 최종 아트는 `docs/after/`입니다.

산탄총 예비탄 임계값, 선택 자료 우회, WASD 경유점 허용 범위, 탈출 중 먼 보급품 우회도 검증 파일럿에서 수정했습니다. 게임 상태·체력·탄약·적·타이머를 직접 변경해서 성공을 만들지 않았습니다. 중단한 파일럿 실행은 완료 검증에 포함하지 않습니다.

- `unguarded-revive-failure.json`: 추출 경계대가 포함된 실행에서 동료 구조 중 엄호가 부족해 기한 초과. 검증 파일럿은 가까운 한 명을 구조자로 정하고 나머지는 적을 엄호 사격하도록 수정했습니다. 사람 플레이에서는 F 구조와 사격 역할을 나누면 됩니다.

- `last-browser-failure.json` 및 `last-script-failure.png`: 최종 성공 전에 기록한 원시 실패 상태와 화면. 최종 통과는 `docs/browser-qa.json`입니다.
