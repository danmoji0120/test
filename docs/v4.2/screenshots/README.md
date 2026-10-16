# 실제 화면과 영상

아래 PNG는 실행 중인 production 게임의 Playwright 캡처입니다. AI 합성 화면이 아닙니다. 자동 조종은 사람 플레이와 구분합니다. 결과에 실패가 있으면 그대로 기록합니다.

| 실행                     | 전투                                                              | 결과                                                              |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| blitz-1 · 귀환           | [1920×1080](../browser-release/blitz-1/combat-1920.png)           | [실제 결과](../browser-release/blitz-1/result-1920.png)           |
| defense-4 · 실패         | [1920×1080](../browser-release/defense-4/combat-1920.png)         | [실제 결과](../browser-release/defense-4/result-1920.png)         |
| defense-4-protect · 귀환 | [1920×1080](../browser-release/defense-4-protect/combat-1920.png) | [실제 결과](../browser-release/defense-4-protect/result-1920.png) |
| defense-4-seed7 · 실패   | [1920×1080](../browser-release/defense-4-seed7/combat-1920.png)   | [실제 결과](../browser-release/defense-4-seed7/result-1920.png)   |
| launch-1 · 귀환          | [1920×1080](../browser-release/launch-1/combat-1920.png)          | [실제 결과](../browser-release/launch-1/result-1920.png)          |
| launch-2 · 귀환          | [1920×1080](../browser-release/launch-2/combat-1920.png)          | [실제 결과](../browser-release/launch-2/result-1920.png)          |
| reactor-1 · 귀환         | [1920×1080](../browser-release/reactor-1/combat-1920.png)         | [실제 결과](../browser-release/reactor-1/result-1920.png)         |
| survey-1-seed7 · 귀환    | [1920×1080](../browser-release/survey-1-seed7/combat-1920.png)    | [실제 결과](../browser-release/survey-1-seed7/result-1920.png)    |
| survey-4 · 실패          | [1920×1080](../browser-release/survey-4/combat-1920.png)          | [실제 결과](../browser-release/survey-4/result-1920.png)          |
| transfer-2 · 귀환        | [1920×1080](../browser-release/transfer-2/combat-1920.png)        | [실제 결과](../browser-release/transfer-2/result-1920.png)        |

## 임무 진행과 UI

- [선택·투입 후보를 보는 로비](../ui-release/launch-lobby-1280.png)
- [12800×8400 전술 지도: 미탐색 지역은 가림](../ui-release/survey-tactical.png)
- [미사일 발사](../browser-release/launch-1/task-launch-launch-미사일-발사.png)
- [실제 데이터 케이스 운반](../browser-release/transfer-2/cargo-carried.png)
- [데이터 전송](../browser-release/transfer-2/task-transfer-upload-데이터-전송.png)
- [드릴 설치](../browser-release/survey-1-seed7/task-survey-survey-a-장비-설치.png)
- [드릴 초기화](../browser-release/survey-1-seed7/task-survey-survey-a-초기화.png)
- [드릴 자동 수집](../browser-release/survey-1-seed7/task-survey-survey-a-데이터-수집.png)
- [중앙 분석](../browser-release/survey-1-seed7/task-survey-analysis-분석-중.png)
- [시설 방어](../browser-release/defense-4-protect/task-defense-defense-방어-중.png)
- [최종 자동 작업 안내: 중도 종료한 실제 UI smoke](../hint-browser/automatic-defense-hint.png)
- [실제 수송기 도착](../browser-release/transfer-2/transport-landed.png)
- [운반 전 과정 영상](../browser-release/transfer-2/video/capture.mp4)

영상은 원본 전체 녹화를 재인코딩한 것이며 음성 청음 증거가 아닙니다. 원본/출력 길이·크기와 FFmpeg 명령은 같은 디렉터리의 encode.json에 보존했습니다. 최종 운반 영상 한 개만 Git에 포함하며, 원본과 중복 중간 영상은 로컬에 유지합니다. 초기 미완료·실패 실행의 JSON·trace·화면은 browser/에 보존합니다.

## 비교 자료와 통제 fixture

- [V4.1 실제6400×4200 전투](../baseline/browser-1/combat-1920.png) / [V4.2 발사 작전 전투](../browser-release/launch-1/firing.png): 전투/AP/PNG는 유지하고 작전과 공간 구성이 달라졌습니다. 같은 전투 순간의 성능 비교가 아닙니다.
- [4인 방어 Seed103](../browser-release/defense-4/combat-1920.png) / [같은 유형·인원 Seed7](../browser-release/defense-4-seed7/combat-1920.png): Seed별 지형/진입 구성이 다릅니다. 장비도 달라 전투 난이도만의 통제 비교는 아닙니다.
- [compact 생성 지형](../performance/world-render/compact.png), [standard](../performance/world-render/standard.png), [large](../performance/world-render/large.png), [expanded](../performance/world-render/expanded.png)는 실제 생성 지형의 **성능 fixture** 캡처입니다. 카메라 순회를 통제했고 AI 전투/작전 성공 증거로 사용하지 않습니다.

첫7개 작전의 자동 작업 E 표시는 후속 안내 보정 전입니다. 새 안내는 후속 조사/방어 및 UI smoke 화면에서 확인할 수 있습니다. 각 실행의 JSON·서버 trace와 함께 판단하세요.
