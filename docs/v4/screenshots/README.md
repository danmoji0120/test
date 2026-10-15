# 실제 화면과 증거 분류

모든 플레이 스크린샷은 실제 Chromium 실행에서 얻었습니다. 이미지 생성 결과는 `assets/`의 원본 아트이며 아래 플레이 증거를 합성하는 데 사용하지 않았습니다.

| 요구 장면 | 증거 |
|---|---|
| 황무지 전체 |[Seed7 전체도](phase2/seed-7-overview.png),[42](phase2/seed-42-overview.png),[103](phase2/seed-103-overview.png),[211](phase2/seed-211-overview.png),[997](phase2/seed-997-overview.png). 실제 생성·렌더 검사 fixture, Fog 해제 표시 있음 |
| 자연 엄폐 교전 |[실제 사격](../browser/solo-3/firing.png),[암반과 장갑 조우](heavy-gameplay/encounter-walker.png) |
| 진압병 |[실제 네트워크 조우](heavy-gameplay/encounter-juggernaut.png) |
| 정찰 드론 |[실제 발견](../browser/heavy-contact/encounter-drone.png) |
| 보행병기 |[실제 발사 준비](heavy-gameplay/encounter-walker.png) |
| 최고 경보 |[4인 최고 경보](../browser/coop-4-level10/alert-4.png),[실제 현장](maximum-response-field.png) |
| 실제 증원 접근 |[영상46초 프레임](approaching-reinforcements.png). HUD약00:42, 왼쪽 하단의 외부 드론e278와 뒤따른 돌격병. 공개 관측41.83s의e278/e279/e281 및 `../browser/heavy-contact/continuity.json`의external-1 출동4와 대조 |
| 중장비 공격 |[실제 전체 영상](operation-heavy-contact.webm),[보행병기 포탄](../browser/heavy-contact/encounter-walker.png) |
| 탈출·착륙 |[실제1인 탈출](../browser/solo-3/stage-extract.png),[수송기 도착](../browser/solo-3/transport-landed.png) |
| 성공·실패 |[1인 성공](../browser/solo-3/result-1920.png),[4인 성공](../browser/coop-4-level3-final/result-1920.png),[최고 난이도4인 실패](../browser/coop-4-level10/result-1920.png) |

`operation-heavy-contact.webm`은 실제 Seed22/난이도8 일반 입력의 전체 녹화(약85초)이며 결과는 실패입니다. `maximum-response.webm`은 실제 난이도10/4인 전멸 녹화의 마지막25초를 FFmpeg로 잘라낸 것이며 장면 합성·재연이 아닙니다. 원본 전체 영상은 `/workspace/doll-squad-v4-qa-raw/video/`에 보존했습니다. `approaching-reinforcements.png`, `maximum-response-field.png`도 그 실제 영상에서 각각46/60초 프레임을 추출했습니다.

`heavy-gameplay/capture-only.json`은 정상 네트워크 작전에 일반 입력으로 접근한 뒤 두 장갑 적을 촬영하고 의도적으로 QA를 종료한 기록입니다. 작전 성공으로 집계하지 않습니다. `phase2/*`와 `performance/audio-art/*`의 단독 적 화면은 명시된 **공격/아트 검사 fixture**이며 일반 작전 성공 증거와 구분합니다. 실패한 조종/관찰 시도도 `../browser/`와 `../tuning/`에 보존했습니다.
