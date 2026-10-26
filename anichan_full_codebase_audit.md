# Ani-Chan Bot — Static Codebase & Command Audit

**Source:** `ani-chan-bot.zip` received 26 October 2026. Scope is the extracted **whatsapp-web.js/Termux** application in this archive; no Baileys implementation is present to audit. This is an **inspection + isolated local tests**, not an authenticated WhatsApp/MongoDB/third-party API production test. The submitted ZIP is unchanged.

## Executive summary

- **299 function-valued command routing keys registered** by `index.js` across 24 top-level command modules, including internal aliases and one accidentally exposed internal listener. `.menu` and `.help` are **special routes**, not part of those 299 keys. Recursive `commands/games/` files provide game engines, not auto-loaded command modules.
- **284 documented command forms**, resolving to **248 distinct registered routing keys** after accounting for aliases, repeats, and `.guild`/`.pet` subcommands. **None of the 284 listed forms points to a missing handler**. This does **not** prove that every handler works in production.
- **51 registered keys are not listed in the public command reference**. Most are intentional owner-only/admin or extended guild commands, not unfinished commands. `.stickeranalyze` is conspicuously omitted although its unit test expects it to be listed; `handleBlacklist` is an internal function accidentally exposed.
- **122 local tests executed:** **121 passed, 1 failed** (sticker-analysis command-reference mismatch). `node --check` found **no JavaScript syntax errors** in application JavaScript. Direct declared npm dependencies loaded cleanly in this archive.
- Confirmed financial logic bugs allow minting currency with negative bets in `.dice` and `.horse`. A mocked behavior reproduction shows a **100-coin wallet becomes 1,100 coins** after a losing `-1000` bet. The `.roulette` payout for a winning red/black bet doubles the expected net gain.
- Uploaded archive contains a **populated `.env` with credentials/secrets**. These values were **not reproduced or included in audit outputs**. Treat this ZIP as sensitive; rotate credentials if shared outside a trusted channel.

### Meaning of status labels

**Implemented in source** = an executable handler exists and performs nontrivial work or delegates to a functional module; network, data and live message behavior remain unverified. **Partial** = intended end-to-end feature is incomplete or contains a confirmed discrepancy. **Absent** = not in current command registry, not advertised in the current command reference. **Documented mismatch** = handler exists but the menu or description is inaccurate. **External-dependent** = implemented integration cannot be declared healthy without service checks. Some items occupy more than one category.

## Confirmed defects and recommended remediation

| ID | Priority | Area / code evidence | Finding | Recommended fix |
| --- | --- | --- | --- | --- |
| A01 | **Critical** | `commands/gamble.js:90-107` `.dice` | Accepts negative `amount`: a loss executes `coins += -amount`, granting coins. Mock test: balance **100 → 1,100** after `.dice -1000` losing 1 vs 6. | Enforce finite safe integer `amount >= 1` and maximum affordable wager **before** rolling; atomic decrement/settlement; regression test. |
| A02 | **Critical** | `commands/gamble.js:189-232` `.horse` | Accepts negative `amount`: `coins -= amount` immediately gives money. Mock losing test **100 → 1,100** after `.horse 1 -1000`. | Same strict wager validation and atomic settlement. |
| A03 | **Critical / security** | `.env` inside ZIP | Actual configured secrets bundled alongside code (`MONGO_URI`, API keys, SMTP credentials etc.). `.gitignore` does not remove files from manually produced ZIP archives. | Exclude `.env` from future exports, distribute `.env.example` only, rotate exposed values where warranted. |
| A04 | **High** | `commands/gamble.js:164-186` `.roulette` | Even-money winner adds **2× the stake as net profit** without first debiting the stake. Mock winning 100-coin red bet: **100 → 300** rather than **100 → 200**. | Represent stake deduction + gross payout, or add only correct **net** winnings; test 0 and all bet types. |
| A05 | **High** | `commands/ai.js:545-565`, `commands/ai.js:675-689`, `utils/aiConversations.js`, `models/AiConversation.js:31-40`, `tests/ai-conversations.test.js:70-76` | **Group AI memory is still separated per group member** (`chatId, senderId, personaId`) rather than **shared per group and persona**. Existing tests expressly preserve per-sender isolation. DM per-user/persona memory is implemented. | For groups use stable group-scoped identity, adjust persistence/index/migrations and tests, preserve DM behavior. |
| A06 | **High** | `index.js:1443-1455`, `commands/ai.js:gpt` | `.gpt` is intended to have **no reactions**, but dispatcher adds a queued `⏳` reaction to every heavy command except `.news`, `.copilot`, `.voice`, and `.play`: **`.gpt` is not excluded**. | Exclude `.gpt` (and any other direct-mode routes) from generic `react()`; add dispatcher regression test. |
| A07 | **High** | `commands/news.js:412-477`, `utils/commandReference.js` ADMIN `.news` item | Scheduler broadcasts on **every hour**, but public description promises **once daily at 8 AM WAT**. Can send up to hourly updates per group when new news exists; no opt-in per group here. | Align intended cadence (8AM once daily or explicitly hourly), make settings/documentation match, add group opt-out if needed. |
| A08 | **Medium / safety** | `commands/anime.js:11-23,59-...`, `utils/danbooru.js:495-545` | SFW image commands try **`rating:sensitive`** if no general result. The random-image filter does not enforce `rating:general`, and does not run the stricter age/style filter used elsewhere. They may show suggestive artwork despite "SFW" label. | Restrict SFW to `rating:general` and validate returned rating/tags client-side. |
| A09 | **Medium** | `commands/games.js:143-147` `.wcg` | Only sends a question and instructs users to reply "A or B"; there is **no reply handler, game state, score or outcome**. | Either implement answer flow and rounds, or reclassify/document as a single random-prompt command. |
| A10 | **Medium** | `commands/fun.js:583-593` `.uno` | Picks a random card and says "next player's turn"; has **no deck, players, turns, legality, win condition, game state**. | Implement actual Uno flow or clearly label it a one-off joke generator. |
| A11 | **Medium** | `commands/downloaders.js:126-133,250-292` `.yt` | Only accepts **progressive audio+video** YouTube streams, explicitly declines separate DASH video and audio. Higher quality / some videos cannot download. | Merge DASH audio+video with ffmpeg where permitted and available, add size/quality fallback tests. |
| A12 | **Medium** | `commands/downloaders.js` `extractSmvdMediaUrl` and `.ig`/`.fb`/`.x` | Shared extractor returns **first image/video** rather than all carousel/gallery items; X only uses `mediaList[0]`. Multi-photo posts are incomplete. | Handle arrays and platform albums, safely paginate/limit WhatsApp sends and report partial failures. |
| A13 | **Medium** | `utils/commandReference.js` AI section; `tests/sticker-analysis.test.js:382-386` | `.stickeranalyze` command **exists** and executes `aiStickers.analyzeCommand`, but is missing from command reference. Test expects `.stickeranalyze [new|redo confirm|stop]` and also expects outdated "text reply without emojis" wording removed. **This is the one failing test**. | Add owner-only `.stickeranalyze` help/documentation and update AI copy; regenerate README; rerun tests. |
| A14 | **Medium** | `utils/commandReference.js` ANIME SFW; `commands/nsfw.js:365...` | `.oppai` is listed as SFW, but implemented in NSFW module and enforced through `getNsfwGate`. In a non-NSFW-enabled group the menu misleads users. | Move `.oppai` to NSFW reference category or adjust intent with a separate safe handler. |
| A15 | **Medium** | `commands/ai.js:...` `.gpt`, `utils/directAiMessages.js:1-10`, `index.js:1170-1192` | Replies to `.gpt` are refused only while **in-memory message IDs survive**; restarting or aging out removes the protection, so subsequent replies can be routed to `.copilot` and stored in persona history. | Persist a durable direct-message marker (TTL DB) or recognize message metadata reliably. |
| A16 | **Medium / policy** | `commands/converter.js:209-227`, `commands/converter.js:233-249` | Sticker pack name is configurable but sticker author defaults to literal **`Brandon`** for `.sticker` / `.take`, instead of active persona. | Reuse `BOT_NAME` and active persona name consistently, preserve explicit `.take` author overrides. |
| A17 | **Medium** | `index.js:200-213`; `commands/admin.js:1056-1074` | The global `Object.entries(module)` auto-registry sees `module.exports.handleBlacklist` as a callable `handleblacklist` command. It expects `(msg)` but dispatcher calls `(client,msg,args)`; it is an internal passive listener, not a usable public command. | Export internal listener with an underscore-prefixed key or exclude it from command registration; use explicit command manifests. |
| A18 | **Medium / reliability** | `index.js:820-832,1280-1304`, `utils/messageClaims.js:5-11,33-71` | Registration/session checks and cross-engine message deduplication **fail open** on unexpected Mongo errors/timeouts. This is a deliberate availability tradeoff, but allows bypassed registration/locks and duplicates while Mongo is unavailable; note that downstream command DB writes may still fail. | Separate security-sensitive gates from noncritical deduplication; fail closed for locked/unregistered identities with clear retry response, use observability. |
| A19 | **Medium / reliability** | `commands/economy.js:346-368`; `utils/guildLock.js:1-34` | `.donate` updates two user balances using two separate `.save()` calls inside `Promise.all`, not a transaction. One failure can cause one-sided transfer; commands from different chats for the same user may also race. Guild in-process lock has no timeout and cannot coordinate two bot processes. | Use Mongo session transaction / guarded `$inc` and idempotency keys; add timeout and cross-process protection as needed. |
| A20 | **Low / privacy** | `index.js:1248-1262,1325-1339`; `commands/feedback.js:52-56` | Dispatcher logs argument previews, which include typed `.setemail` addresses; `.feedback` logs full user-submitted text. | Mask private arguments and reduce log retention/access. |
| A21 | **Low / maintenance** | `package.json`; source-wide require scan | Direct `node-fetch` dependency has **no direct application `require('node-fetch')` use** (Node 22 has built-in `fetch`). `puppeteer` is used by `whatsapp-web.js` transitively, so **do not blindly remove it**. | Verify lockfile/transitive dependencies before removing unused direct dependencies; retain runtime Puppeteer/Chromium. |
| A22 | **Low / coverage** | `tests/` | Existing **122 tests are concentrated on AI/reactions/stickers**. No dedicated tests for wagers, guild funds, cards trading, downloader response shapes, admin roles, email recovery, scheduled news or media conversion. | Add mocked integration/regression tests for each major command category, then run staging tests with isolated accounts and providers. |
| A23 | **Low / external** | `commands/converter.js:60-161,556-579` | `.tourl` is fully wired to a sequence of anonymous upload hosts, but the URLs and retention behavior require live validation. Prior host outages mean "implemented" is not the same as "verified operational". | Probe small test files against each configured provider, enforce MIME/size restrictions, report available providers. |
| A24 | **Low / external** | `commands/ai.js`, `commands/search.js`, `commands/downloaders.js` | AI image/upscale, TTS, Pinterest and social-download commands have real integration code, but require valid quotas, API subscriptions and actual response-schema tests. The archive's configured keys **do not establish that services work**. | Add provider health checks, mock captured JSON and smoke tests with test resources. |
| A25 | **High / economy design** | `commands/economy.js:1107-1144` `.lottery`; `commands/gamble.js:110-145` `.db`/`.dp` | **Positive expected-value betting can inflate currency even after negative inputs are fixed.** A 100-coin lottery ticket has **+910 coins expected net return per play** from its 1%/9%/20% prize probabilities; `.db` has **+0.5× bet** and `.dp` **+0.35× bet** expected net. Uncapped repeat play amplifies this. This may be intentional generosity but is a major balancing risk. | Decide a target payout/house edge, cap or cooldown wagers, and test expected values with simulations. |

### Minimal reproductions actually run

Mocked `User.findOrCreate()`, message response and `Math.random()` (no WhatsApp, no database writes):

```text
.dice -1000       (lose 1 vs 6): starting coins 100 -> 1100
.horse 1 -1000    (lose horse race): starting coins 100 -> 1100
.roulette 100 red (red 7): starting coins 100 -> 300
```

The third outcome illustrates a payout design defect assuming standard even-money net winnings: 100 stake on red should yield net +100, not +200. It is not a negative-bet exploit.

## Commands that do not exist in this archive

The **current 284 documented command forms all route to code**. The following older-style/full anime catalogue commands are **not registered or advertised in this submitted snapshot**, and cannot be considered implemented from this archive: **`.start`, `.anime` (metadata/search), `.manga`, `.character`, `.fav`, `.favorites`, `.cancel`, `.policy`, `.fetch`, `.score`**. Do not mistake `.waifu/.neko` random anime images, `.quiz`, `.news`, or `.cards` for those missing dedicated handlers. Treat them as absent **only if they remain in the desired feature scope**; there is no contemporary TODO/README promise for them.

**Baileys:** `index.js` is a `whatsapp-web.js` entrypoint and all loaded command modules use `(client,msg,args)` and `msg.reply()` semantics. The other engine/branch referenced by source comments is **not included in this ZIP**, so cross-engine feature parity is unverified.

## Full public command audit by menu section

Every name in these groups **has a registered handler**, unless specifically marked partial, buggy, external-dependent or documentation-inaccurate above. "Present" below means source implementation only, not an external live-service guarantee.

### GENERAL (12 unique command names/forms)

`.rules`, `.setrules`, `.ping`, `.test`, `.stats`, `.users`, `.deluser`, `.mods`, `.owner`, `.url`, `.otp`, `.afk`.

### CARDS (45 unique command names/forms)

`.cards`, `.card`, `.ci`, `.cardinfo`, `.si`, `.ss`, `.clb`, `.vlb`, `.tlb`, `.sslb`, `.mclb`, `.slb`, `.deck`, `.col`, `.cardshop`, `.sellc`, `.buyc`, `.rc`, `.claim`, `.sc`, `.acceptsale`, `.declinesale`, `.tc`, `.accepttrade`, `.declinetrade`, `.lendcard`, `.lc`, `.unlendcard`, `.ulc`, `.fuse`, `.fusion`, `.wishlist`, `.wishlb`, `.auction`, `.listauc`, `.submit`, `.bid`, `.myauc`, `.remauc`, `.stardust`, `.anticamp`, `.tier`, `.cs`, `.myseries`, `.resell`.

### ECONOMY (43 unique command names/forms)

`.balance`, `.bal`, `.orbs`, `.ebal`, `.daily`, `.withdraw`, `.wd`, `.deposit`, `.dep`, `.donate`, `.lottery`, `.rich`, `.richg`, `.profile`, `.p`, `.setemail`, `.edit`, `.reg`, `.setname`, `.setdob`, `.bio`, `.setbio`, `.setage`, `.setpic`, `.removepic`, `.inventory`, `.inv`, `.use`, `.sell`, `.shop`, `.buy`, `.dig`, `.fish`, `.leaderboard`, `.lb`, `.achievements`, `.ach`, `.level`, `.xp`, `.roast`, `.gamble`, `.loan`, `.beg`.

### GAMES (17 unique command names/forms)

`.chess`, `.move`, `.ttt`, `.c4`, `.drop`, `.startbattle`, `.attack`, `.defend`, `.flee`, `.quitgame`, `.quit`, `.akinator`, `.aki`, `.greekgod`, `.gg`, `.wcg` ⚠️, `.quiz`.

### GUILDS (16 unique command names/forms)

`.guild info`, `.guild create`, `.guild description`, `.guild invite`, `.guild accept`, `.guild decline`, `.guild emblem`, `.guild members`, `.guild promote`, `.guild demote`, `.guild remove`, `.guild donate`, `.guild leaderboard`, `.guildlb`, `.guild leave`, `.guild disband`.

### GAMBLE (7 unique command names/forms)

`.slots`, `.cf`, `.dice` ⚠️, `.db`, `.dp`, `.roulette` ⚠️, `.horse` ⚠️.

### INTERACTION (19 unique command names/forms)

`.hug`, `.kiss`, `.slap`, `.wave`, `.pat`, `.lick`, `.punch`, `.bonk`, `.spank`, `.tickle`, `.kill`, `.fuck`, `.kidnap`, `.die`, `.dance`, `.sad`, `.smile`, `.laugh`, `.angry`.

### FUN (20 unique command names/forms)

`.gay`, `.lesbian`, `.simp`, `.pick`, `.skill`, `.duality`, `.ship`, `.gen`, `.pov`, `.social`, `.relation`, `.pp`, `.wouldyourather`, `.wyr`, `.joke`, `.truth`, `.dare`, `.td`, `.uno` ⚠️, `.meme`.

### DOWNLOADERS (6 unique command names/forms)

`.ig` ⚠️, `.ttk` ⚠️, `.yt` ⚠️, `.x` ⚠️, `.fb` ⚠️, `.play`.

### SEARCH (6 unique command names/forms)

`.pinterest`, `.pint`, `.sauce`, `.reverseimg`, `.wallpaper`, `.lyrics`.

### AI (11 unique command names/forms)

`.copilot` ⚠️, `.gpt` ⚠️, `.voice` ⚠️, `.stickerimport`, `.imagine`, `.upscale`, `.translate`, `.tt`, `.transcribe`, `.tb`, `.tts`.

### CONVERTER (11 unique command names/forms)

`.sticker` ⚠️, `.s`, `.take` ⚠️, `.toimg`, `.tovid`, `.tomp3`, `.tovn`, `.rotate`, `.flip`, `.resize`, `.tourl`.

### ANIME SFW (9 unique command names/forms)

`.waifu` ⚠️, `.neko` ⚠️, `.maid` ⚠️, `.oppai` ⚠️, `.selfies` ⚠️, `.uniform` ⚠️, `.mori-calliope` ⚠️, `.raiden-shogun` ⚠️, `.kamisato-ayaka` ⚠️.

### ANIME NSFW (10 unique command names/forms)

`.nsfw`, `.milf`, `.ass`, `.hentai`, `.oral`, `.ecchi`, `.paizuri`, `.ero`, `.ehentai`, `.nhentai`.

### ADMIN (29 unique command names/forms)

`.kick`, `.delete`, `.pin`, `.unpin`, `.antilink`, `.antibot`, `.antism`, `.warn`, `.resetwarn`, `.groupstats`, `.gs`, `.welcome`, `.setwelcome`, `.leave`, `.setleave`, `.purge`, `.blacklist`, `.promote`, `.demote`, `.mute`, `.unmute`, `.hidetag`, `.tagall`, `.activity`, `.active`, `.inactive`, `.open`, `.close`, `.news` ⚠️.

### PETS (6 unique command names/forms)

`.pet`, `.pet catalogue`, `.pet adopt`, `.pet feed`, `.pet play`, `.pet name`.

### TEXT STYLES (1 unique command names/forms)

`.fancy`.

### FEEDBACK (1 unique command names/forms)

`.feedback`.

## Implemented but omitted from the public menu

The full CSV inventories all **299** registered routing keys and tags the **51** undocumented keys. Major groups are **owner-only card manager functions** (`.addcard`, `.bulkadd`, `.delcard`, `.editcard`, `.reloadcards`, `.cardstats`, `.backfillimages`, `.upgradeimages`, `.mergecards`, `.stealimage`, `.autoexpand`, `.diagcard`, `.repairlinks`, `.purgeorphans`), `.addxp`, extended **guild subcommands** (events, quests, challenges, shop, upgrades, recruitment and seasons), `.stickeranalyze`, `.antilinkaction` and the unintended `.handleblacklist`. Some undocumented exports are deliberate aliases/wrappers; not every omission requires a menu item. The authoritative programmatic list is in `anichan_command_inventory.csv`.

## Functional systems observed in source

- **Startup & transport:** `index.js` creates `whatsapp-web.js` `Client` with `LocalAuth`, Termux Chromium/Puppeteer configuration, MongoDB connection/retry, per-chat queue, global serialized heavy-work queue, async error logging and hourly background jobs.
- **Accounts:** 18+ registration with DOB, email recovery + hashed OTP with time/attempt limits, session lock after inactivity, profile/social systems, coins/orbs/XP, inventories, pet state.
- **AI:** Gemini one-shot `.gpt`, persona-aware `.copilot`/`.voice`, image generation, translation, transcription, Fish Audio TTS, Cloudinary + MongoDB sticker ingestion and manual analysis, AI emoji/reaction handling, per-persona DB memory; **group scope remains wrong**.
- **Games:** Chess, Connect 4, Tic Tac Toe, Battle, quiz, Akinator have game-engine/service code, many with Mongo-backed session persistence; **`.wcg` and `.uno` are only one-shot prompts**, not turn-driven games.
- **Cards/guilds:** Large data models and auction/trade/card-drop/guild management implementations, scheduled card tasks, and per-guild mutation queues. Transaction safety must be audited with concurrency tests before production trust.
- **Media:** ffmpeg conversions, rendered board/card images, downloader API clients and multi-host `.tourl`. These depend on external binaries/services/network and could not be live validated here.
- **Moderation:** group flags, spam/bot/link/blacklist controls, member stats, mutes and per-group announcements. Careful validation against group admin permissions and WhatsApp changes is still needed.

## Tests actually executed and limits

1. `node --check` against all `.js` files outside `node_modules`: **syntax check clean**.
2. `node --test tests/*.test.js`: **122 total; 121 pass; 1 fail**. Failing case `tests/sticker-analysis.test.js:382-386`, expects `.stickeranalyze` in `utils/commandReference.js` and no older claim that Copilot text excludes emojis.
3. `npm ls --depth=0 --omit=dev`: installed direct application dependencies resolve cleanly (not a vulnerability scan).
4. Loaded top-level command module exports locally and compared routing keys to the public `COMMAND_REFERENCE`; **all 284 menu variants resolve**.
5. Mocked execution (in-memory only) of `.dice`, `.horse`, `.roulette` to confirm payout arithmetic. This is not a real Mongo/WhatsApp test.

**Not performed:** live WhatsApp pairing or group tests, Mongo connection or schema migration against your cloud data, actual coin transfer on user accounts, current API availability/subscription/quota checks, Chromium launches, actual ffmpeg operations on device, package vulnerability advisory scan, source-diff against a different branch. Do not treat those areas as certified working.

## Recommended repair order

1. **Protect secrets and fix the two currency-minting vulnerabilities immediately**; revalidate all wager inputs. Then correct roulette arithmetic, review lottery/`.db`/`.dp` payouts, and add wallet atomicity tests.
2. Fix `.gpt` dispatcher status reaction and **group-shared per-persona memory** without altering DM privacy/memory. Update tests to the new group behavior.
3. Restrict "SFW" image sources to safe ratings, then correct `.oppai` menu classification.
4. Decide news cadence and update scheduler/README/menu consistently. Add account/session resilience that does not silently bypass important checks.
5. Decide whether `.wcg` and `.uno` are genuine games or prompt generators; close the implementation gap or relabel.
6. Extend YouTube DASH merging and albums/carousels if required, then verify APIs and `.tourl` against actual services.
7. Update `.stickeranalyze` reference, stale Copilot emoji wording, sticker author defaults, and prevent internal functions from entering the command registry; rerun all tests and add missing module tests.

---

**Integrity:** Original user ZIP was not modified. The `anichan_command_inventory.csv` is generated solely from parsed/loaded command exports and the code reference. The report and CSV contain no secret values.
