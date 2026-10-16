# V4.1 실제 화면 증거

일반 작전은 프로덕션 WebSocket 서버에 연결한 Chromium의 실제 DOM·키보드·마우스 입력 결과입니다. `fixture-*`는 별도로 표시된 통제 장면이며 일반 임무 성공 증거가 아닙니다. 생성 PNG는 게임 리소스에만 사용했고, 아래 화면을 AI로 합성하지 않았습니다.

|요구 장면|파일|분류|
|---|---|---|
|세 슬롯 로드아웃 /720p|[로드아웃](../final-ui/loadout-antiarmor-1280.png)|일반 로비|
|주무장 AT 장착|[AT](../final-ui/primary-at-antiarmor.png)|실제 서버·일반 투입지 입력|
|부무장 권총 전환|[권총](../final-ui/secondary-antiarmor.png)|실제 서버·일반 투입지 입력|
|대전차 수류탄|[투척](../final-ui/consumable-antiarmor.png)|실제 서버·일반 투입지 입력|
|연막|[연막](../final-ui/consumable-smoke.png)|실제 서버·일반 투입지 입력, AI 차단은 서버 검사와 함께 확인|
|관통 실패|[도탄](../final-feedback/fixture-ricochet.png)|명시적 통제 fixture|
|실제 노출 약점의 부분 관통|[부분·약점](../final-feedback/fixture-partial.png)|명시적 통제 fixture|
|보행병기 동력부 손상|[부품 파괴](../final-feedback/fixture-component.png)|명시적 통제 fixture|
|이동 표적 추적 사격|[추적](../final-feedback/fixture-tracking.png)|명시적 통제 fixture, 수치는 combat 실험에 기록|
|난이도10 실제 교전|[교전](../browser/release-level10/firing.png)|일반 작전, 최종 전멸|
|최고 경보 / 실제 탈출|[경보](../browser/release-4/alert-4.png) · [수송기](../browser/release-4/transport-landed.png)|일반4인 작전|
|성공 결과|[4인 성공](../browser/release-4/result-1920.png)|일반 작전|
|전멸 결과|[솔로 난이도10](../browser/release-level10/result-1920.png)|일반 작전|

원본 영상은 `../browser/release-level10/video/`의 WebM입니다. 전체 입력 실행의 영상이며 편집한 하이라이트가 아닙니다. 페이지 오류·프레임·목표·보상·재접속·재출격은 각 디렉터리의 `browser-qa.json`, 서버 출동·부위·장비 상태는 `server-trace.json`에 있습니다.

V4 변경 전 화면은 [기준 로비](../baseline/browser-1/lobby-1920.png)와 같은 디렉터리의 전투/결과 이미지입니다. 이전 V4의 증거도 `docs/v4/`에 그대로 보존합니다.
