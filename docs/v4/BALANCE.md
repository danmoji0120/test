# V4 balance ledger (work in progress)

Basic rifle/rush/support HP stays65/48/105 at every difficulty and team size. New threats are distinct rather than HP inflation: juggernaut240, drone50, walker650, artillery450. Widths52/28/108/100. Directional armor multiplies ordinary weapon damage: juggernaut front.11/side.48/rear1.1; walker.045/.24/.95; artillery.18/.48/1.05. Orange rear arc identifies the weak quarter. Explosives multiply by.68/.95/1.25; rocket460 base vs armor,22% base vs infantry. Front walker requires3 rockets; rear2, or one rear rocket and gunfire. Every operator can obtain a finite shared supply rocket; launcher loadout starts2 in exchange for60 reserve rounds and4% speed.

Spinup/counterplay: juggernaut1.1s,14×9 bullets at.085s,3.8s overheat; walker1.1s,5×24 cannon projectiles600u/s at.17s,3.6s reload; artillery1s commitment then2.6s marked incoming shell,48 max splash/125 radius,8.5s reload/minimum380 range. Shell target is fixed to dated sensed/radio information. Cover blocks blasts; no offscreen homing.

Threat unlocks:5 juggernaut,7 drone,8 walker,9 artillery.10 starts additional recon/armor and higher elite fraction. Regular infantry health/damage are unchanged; elite infantry use shorter burst gaps, more accurate aim and larger actual flank offsets. All tiers remain solo-attemptable.

Initial tuning public-state pilots (prior to final budget/physics polish): level10 prepared solo seed7 failed24s,seed42 failed56s; four prepared pilots succeeded50/55s with149/36 aggregate incoming damage,8 rockets each,alert4 and6/8 physical departures. This is automated aim/navigation and accelerated simulation, **not a human win rate or human operation duration**. No defeat trigger was inserted. Raw rows retained in `tuning/first/matrix.json`. Final broader matrix pending.

## Final evidence and limits

Final fixed-seed matrix:54 primary-route attempts across1/2/4 operators and levels1/3/5/7/8/10:50 successes,4 failures. Prepared4-person all-objective attempts succeed on7/42/103; unprepared solo primary and all-objective attempts each fail on all three seeds. Additional unselected-outcome random seed469532 yields14 successes/4 failures across the same18 level/team combinations. No HP/defeat/timeout adjustment was made to reach these proportions. Ordinary infantry HP remains65/48/105. These are capable10Hz automatic aim/navigation pilots using public static terrain, not measured human victory rates.

Actual browser evidence is harsher: difficulty3 succeeds with1/2/4 clients; difficulty10 four clients fail54.83s with2 authoritative revives. This includes software rendering/recording/input-automation effects on a2vCPU machine and is not a controlled human balance study. See `TEST_RESULTS.md` for full failed and successful data.

Fairness refinements: artillery requires a dated **visual** report, never sound alone or a facility guard assignment. Its shell moves through actual world coordinates to a fixed warned impact; hidden shooter/origin/distance are not sent. Rockets collide with facilities as well as armor/terrain. Heavy guards start separated by body clearance, and losing LOS prompts a real route to the last sighting. No enemy/player HP inflation by squad size, no invisible instant hits, no kill-trigger spawning, no manufactured failure.

Target human operation length and first10-minute enjoyment remain unmeasured. Fast automated completion can be under2minutes. We retained movement/choice and did not add fixed waiting to manufacture a duration. Human listening, GPU Windows performance and expert solo difficulty10 review remain pending;60FPS maximum-load software rendering is not passed.
