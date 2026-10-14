# V2 튜닝과 실패 기록

- `initial-pressure-failure.json`/PNG: 최초 높은 지속 화력/초기 전방 투입. 44.6초,40처치,전멸. 투입 안전 거리와 지속 화력/퍼짐을 조정했습니다.
- `initial-simulation.json`: 같은 초기 조정의1·2·4인×3Seed. 실패를 포함한 원시 시뮬레이션이며 최신 결과는 상위 `simulation-qa.json`입니다.
- `extraction-dodge-failure.json`/PNG: 조정 후 실제4인,275.8초/138처치/14소생. 전원 생존 상태로 추출에 도달했으나 자동 회피로3초 집결을 유지하지 못해 기한 초과. 게임 판정은 유지하고 QA 파일럿의 추출 원 내부 회피만 수정했습니다.
- `parallel-browser-failure.json`/PNG: 네 명 전체 QA와1·2인 스모크를 한3-vCPU 머신에서 함께 실행. 평균114.9ms 프레임,초반 전멸. 최종 실행은 브라우저 작업을 순서대로 진행했습니다. 높은 머신 부하를 게임 성공이나 독립 성능으로 계산하지 않습니다.

재접속을 포함한 최신 전체4인 결과는 상위 `browser-qa.json`, 실제 캡처는 `../after/`. `../performance/`의 별도 합성 렌더 장면은 실제 작전 증거가 아닙니다.
