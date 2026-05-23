# Docs Style Reference

## 0. Activation Scope

This style applies only to:

```text
/docs/**
```

Examples:
- `/docs/01-start-here.md`
- `/docs/02-glossary.md`
- `/docs/03-project-overview.md`
- `/docs/04-system-map.md`
- `/docs/05-data-flow.md`
- `/docs/06-components.md`
- `/docs/07-core-workflows.md`
- `/docs/08-setup-and-run.md`
- `/docs/09-testing-debugging.md`
- `/docs/10-roadmap.md`

Do not apply this style to:
- `README.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `.github/**`
- `.vscode/**`
- any markdown outside `/docs/**`
- code comments
- inline JSDoc/TSDoc/Python docstrings
- issue templates
- pull request templates
- commit messages

If the task targets both `/docs/**` and markdown outside `/docs/**`, apply this style only to `/docs/**` unless the user explicitly asks for the same style elsewhere.

## 1. Core Goal

Produce documentation that is:
- clear enough for non-technical readers
- still serious enough for developers
- structured enough for future maintenance
- easy to scan
- not overly casual
- not overly academic
- not written like a beginner tutorial

Preferred:

Redis cache *(bo nho tam toc do cao)* duoc dung de giam latency *(thoi gian cho phan hoi)* cho cac truy van du lieu lap lai. Nhung du lieu duoc goi nhieu lan se duoc luu tam trong Redis, giup backend khong phai truy van database lien tuc.

Avoid:

Co mot so du lieu duoc hoi di hoi lai rat nhieu lan. Neu lan nao he thong cung di hoi database thi se cham. Vi vay he thong dung mot "bo nho tam" de nho san cau tra loi trong thoi gian ngan. Bo nho tam nay goi la Redis cache.

## 2. Documentation Tone

Use this tone:
- ro
- gon
- co thuat ngu
- co mo ngoac giai thich khi can
- khong binh dan hoa qua muc
- khong viet nhu bai giang nhap mon
- khong viet nhu system design interview
- khong pho ky thuat
- khong giau ky thuat

Use analogies only when:
- the concept is difficult
- the file is explicitly a glossary or concept note
- the user asks for a non-technical explanation
- a short analogy prevents a long explanation

Keep analogies short.

## 2a. Vietnamese Writing Rules

Write Vietnamese with diacritics by default.

Rules:
- use natural, fully accented Vietnamese unless the file or repo already has a deliberate ASCII-only convention
- do not mix accented and non-accented Vietnamese in the same file without a strong reason
- do not use sloppy shorthand, chat-style wording, or half-English filler
- keep technical terms in English when they are the clearer industry term, but explain them in Vietnamese on first use if needed

Preferred:

`Dữ liệu được đọc từ Redis trước. Nếu cache không có, backend truy vấn PostgreSQL rồi ghi lại vào cache.`

Avoid:

`Du lieu doc tu Redis truoc. Neu khong co thi backend query Postgres roi cache lai, no se nhanh hon.`

## 3. Technical Term Policy

Use this pattern for terms that may block readers:

`technical term *(short Vietnamese explanation)*`

Examples:
- `latency *(thoi gian cho phan hoi)*`
- `response time *(thoi gian API tra ket qua)*`
- `throughput *(so request xu ly moi giay)*`
- `bottleneck *(diem nghẽn lam he thong cham)*`
- `cache *(bo nho tam)*`
- `Redis cache *(bo nho tam toc do cao)*`
- `TTL *(thoi gian cache con hieu luc)*`
- `queue *(hang doi xu ly nen)*`
- `worker *(tien trinh xu ly job nen)*`
- `job *(tac vu duoc dua vao queue)*`
- `backlog *(job ton dong chua xu ly kip)*`
- `timeout *(qua thoi gian cho nen request bi huy)*`
- `retry *(thu lai sau khi loi)*`
- `fallback *(phuong an du phong khi loi)*`
- `rate limit *(gioi han so request trong mot khoang thoi gian)*`
- `index *(muc luc giup database tim nhanh hon)*`
- `pagination *(chia du lieu thanh tung trang nho)*`
- `schema *(cau truc du lieu chuan)*`
- `migration *(thay doi cau truc database co kiem soat)*`
- `webhook *(callback tu he thong ngoai)*`
- `idempotency *(chong xu ly trung request)*`
- `observability *(kha nang quan sat he thong khi chay that)*`
- `monitoring *(theo doi chi so he thong)*`
- `logging *(ghi log de tra loi)*`
- `trace *(dau vet luong xu ly qua nhieu service)*`
- `alert *(canh bao khi vuot nguong loi)*`

Rules:
- explain on first occurrence in a file
- do not explain repeatedly in the same file
- prefer glossary for repeated terms
- keep explanations short

## 4. Sentence Style

Use short, controlled sentences.

Preferred patterns:
- `He thong dung [ky thuat] de [muc dich].`
- `[Ky thuat] giup [tac dong cu the], dac biet khi [tinh huong].`
- `[Component] chiu trach nhiem [nhiem vu].`
- `Diem can chu y la [rui ro / gioi han / bottleneck].`

Avoid:
- too many clauses in one sentence
- vague words like `toi uu`, `manh me`, `linh hoat` without evidence
- marketing phrasing

## 5. File Naming and Numbering

Use numeric prefixes to make reading order clear.

Default rule:

- prefer sequential numbering that follows the actual reading order of the project
- use `01-`, `02-`, `03-` ... by default for project docs
- only use spaced numbering such as `10`, `20`, `30` when the project already has that convention, the gaps are useful, and the files still read in a clear linear order from top to bottom
- if the existing numbering is confusing, duplicated, or inconsistent, refactor file names into a clearer sequence

Recommended compact structure for most repos:

```text
docs/
  01-start-here.md
  02-glossary.md
  03-project-overview.md
  04-system-map.md
  05-data-flow.md
  06-components.md
  07-core-workflows.md
  08-setup-and-run.md
  09-testing-debugging.md
  10-roadmap.md
  11-archive.md
```

Numbering rules:
- `01` = entry point
- `02` = glossary / shared terms
- `03` = project overview
- `04` = system map
- `05` = data flow
- `06` = components
- `07` = workflows
- `08` = setup and run
- `09` = testing and debugging
- `10` = roadmap and limitations
- `11+` = archive, appendix, or project-specific extensions

Do not force this exact map if the project has a better local reading order. The important rule is that the numbering must remain linear, clear, and consistent from top to bottom, regardless of whether it uses `01/02/03` or `10/20/30`.

## 6. Required Reading Flow

Readers should be able to move in this order:

1. What is this project?
2. Who uses it?
3. What problem does it solve?
4. What are the main parts?
5. How does data move?
6. What workflows matter most?
7. Which techniques are important?
8. Where can the system become slow or fragile?
9. How do developers run it?
10. How do maintainers debug and operate it?

Never organize docs only by technology names.

## 7. Standard File Template

For most `/docs/**` files, use:

```md
# [Title]

## 1. Muc dich

## 2. Tom tat

## 3. Noi dung chinh

## 4. Luong xu ly / So do

## 5. Diem can chu y

## 6. Lien quan
```

Do not force every section if it adds noise, but architecture, workflow, bottleneck, setup, and operations docs should usually follow it.

## 8. Technique Section Template

```md
## [Technique Name]

**Muc dich:** [What problem it solves.]

**Cach hoat dong:** [How it works in this project.]

**Tac dong:** [What changes because of this technique.]

**Diem can chu y:** [Risk, tradeoff, limit, or failure mode.]
```

## 9. Bottleneck Template

Every bottleneck should answer:
- cham o dau?
- cham khi nao?
- dau hieu la gi?
- nguyen nhan thuong gap la gi?
- anh huong toi user hoac he thong la gi?
- huong xu ly la gi?
- danh doi la gi?

Use:

```md
## Bottleneck: [Name]

**Vi tri:** [Component A] -> [Component B]

**Dau hieu:** [Observable symptoms.]

**Nguyen nhan chinh:** [Likely causes.]

**Anh huong:** [Impact on user/system.]

**Huong xu ly:** [Fixes or mitigations.]

**Danh doi:** [Cost or tradeoff of the fix.]
```

## 10. Workflow Template

For each workflow, document normal flow and failure flow.

```md
# [Workflow Name]

## 1. Muc dich

## 2. Luong thanh cong

```txt
[User] -> [Frontend] -> [Backend API] -> [Database] => [Response]
```

## 3. Cac buoc xu ly

| Buoc | Thanh phan | Viec xay ra |
|---|---|---|
| 1 | User | Gui request |
| 2 | Frontend | Thu thap input va goi API |
| 3 | Backend API | Validate input va xu ly logic |
| 4 | Database | Luu hoac doc du lieu |
| 5 | Backend API | Tra response |

## 4. Luong loi

```txt
[Backend API] -> [External API] --x timeout
[Backend API] -> [Fallback] => [Response]
```

## 5. Diem can chu y
- [Bottleneck]
- [Security risk]
- [Data consistency risk]
- [Retry/fallback behavior]
```

Always show the happy path first, then error path.

## 11. Component Template

Use for `06-components.md`.

```md
## [Component Name]

**Vai tro:** [What it does.]

**Input:** [What it receives.]

**Output:** [What it returns or produces.]

**Phu thuoc:** [Database, external API, queue, storage, etc.]

**Diem can chu y:** [Bottleneck, failure mode, scaling issue.]
```

## 12. Key Decision Template

Use for a project-specific decision file such as `11-key-decisions.md` or another clear sequential slot.

```md
## Decision: [Decision Name]

**Chon:** [Chosen option.]

**Ly do:** [Why this option was chosen.]

**Khong chon:** [Alternatives.]

**Danh doi:** [What became harder because of this choice.]

**Khi nao can xem lai:** [Condition that may invalidate the decision.]
```

## 13. Glossary Template

`02-glossary.md` should be short and practical.

```md
# Glossary

| Thuat ngu | Nghia ngan | Dung trong du an |
|---|---|---|
| Latency | Thoi gian cho phan hoi | Dung de danh gia API tra ket qua nhanh hay cham |
| Cache | Bo nho tam | Luu du lieu hay duoc goi de tra nhanh hon |
| TTL | Thoi gian cache con hieu luc | Dung de tranh cache giu du lieu qua cu |
```

Rules:
- one row per term
- no long explanations
- only terms actually used

## 14. Table Rules

Use tables for comparison, summary, component list, bottleneck list, decision list, and error list.

Rules:
- maximum 4 columns by default
- prefer 3 columns when possible
- avoid long paragraphs inside cells
- keep column names concrete
- keep cells short

## 15. Diagram Rules

Use plain text diagrams. Avoid emojis and decorative symbols.

Allowed labels:
- `[User]`
- `[Frontend]`
- `[Backend]`
- `[API]`
- `[DB]`
- `[Cache]`
- `[Queue]`
- `[Worker]`
- `[Storage]`
- `[3rd-party]`

Allowed symbols:
- `->`
- `=>`
- `<-`
- `--x`
- `...`
- `()`

Rules:
- every diagram must be followed by a short explanation
- avoid diagrams with more than 8 nodes unless necessary
- split large flows into smaller diagrams
- prefer one normal-flow diagram and one error-flow diagram

## 16. Start Here Template

Use for `/docs/01-start-here.md`:

```md
# Start Here

## 1. Du an nay la gi?

## 2. Ai nen doc docs nay?

| Nguoi doc | Nen doc phan nao |
|---|---|
| Nguoi moi vao du an | Tong quan, system map, data flow |
| Dev | Workflows, key techniques, setup, debugging |
| PM / non-tech | Overview, user journey, bottlenecks |
| Nguoi van hanh | Operations, monitoring, common errors |

## 3. Thu tu doc de xuat

| Thu tu | File | Doc de hieu |
|---|---|---|
| 1 | 03-project-overview.md | Du an lam gi |
| 2 | 04-system-map.md | He thong gom nhung phan nao |
| 3 | 05-data-flow.md | Du lieu di qua he thong ra sao |
| 4 | 06-components.md | Cac module chinh co vai tro gi |
| 5 | 07-core-workflows.md | Cac luong xu ly chinh |
| 6 | 08-setup-and-run.md | Cach chay du an |
| 7 | 09-testing-debugging.md | Cach test va debug |
| 8 | 10-roadmap.md | Cai gi da co va cai gi con thieu |

## 4. Cach doc docs
```

## 17. Core Overview Templates

Use the templates from your spec for:
- `/docs/03-project-overview.md`
- `/docs/04-system-map.md`
- `/docs/05-data-flow.md`
- project-specific bottleneck docs if the repo has them
- project-specific error docs if the repo has them

Keep:
- clear purpose
- summary
- diagrams and short tables
- failure points
- operational notes

## 18. Setup Docs Rules

For setup files such as:
- `08-setup-and-run.md`
- `09-env-config.md`
- `10-local-dev.md`
- `11-deploy.md`

Rules:
- show command first
- then explain what it does
- then explain common failure
- do not bury commands inside long prose
- do not write setup like an essay

## 19. Security Docs Rules

Security docs must be concrete and non-alarmist.

Rules:
- never include real secrets
- use placeholders
- explicitly mark sensitive values as examples
- do not document quick hacks that bypass security unless clearly internal and temporary

Use placeholders:
- `DATABASE_URL=postgres://user:password@localhost:5432/app`
- `API_KEY=<replace-with-your-api-key>`
- `JWT_SECRET=<replace-with-local-secret>`

## 20. Performance Docs Rules

Connect metric to user impact.

Performance sections should include:
- `Chi so`
- `Y nghia`
- `Anh huong`
- `Nguyen nhan thuong gap`
- `Huong xu ly`

## 21. AI / Agent Docs Rules

Avoid vague magic language.

Always mention:
- Input
- Context
- Tool access
- Output
- Failure mode
- Evaluation / checking method

Template:

```md
## AI Agent Flow

**Input:** [What the user/system sends.]

**Context:** [What documents/data the agent can see.]

**Tool access:** [What tools the agent can call.]

**Output:** [What the agent returns.]

**Failure mode:** [Where it can be wrong.]

**Cach kiem tra:** [How to validate result.]
```

## 22. Rewrite Rules

When rewriting existing `/docs/**` files:
- preserve factual meaning
- improve structure before wording
- remove duplicated ideas when two sections say the same thing
- refactor headings and file names when the current structure makes the reading order unclear
- do not add unsupported claims
- do not invent architecture
- mark unknowns as `TODO` instead of guessing
- keep existing commands and paths unless clearly wrong
- keep code blocks intact unless the task is to fix them
- do not restyle markdown outside `/docs/**`

Use TODO format:

`> TODO: Xac nhan lai service nao chiu trach nhiem gui email trong production.`

## 23. Review Checklist

When reviewing a `/docs/**` file, check:

- [ ] File nam duoi `/docs/**`
- [ ] Ten file co prefix so neu thuoc docs chinh
- [ ] So thu tu doc tu tren xuong ro rang, khong nhay bat quy luat neu khong co ly do
- [ ] Tieu de ro rang
- [ ] Co muc dich file
- [ ] Co tom tat ngan
- [ ] Tieng Viet co dau va thong nhat trong toan file
- [ ] Khong lap y giua tieu de, doan van, va bang tom tat
- [ ] Thuat ngu kho co mo ngoac ngan
- [ ] Khong giai thich qua dai nhu tutorial nhap mon
- [ ] Co so do neu luong kho hinh dung
- [ ] Bang khong qua 4 cot
- [ ] Bottleneck co dau hieu, nguyen nhan, anh huong, huong xu ly
- [ ] Workflow co happy path va error path neu can
- [ ] Co link den docs lien quan neu phu hop
- [ ] Khong co secret that
- [ ] Khong claim qua muc so voi code/docs hien co

## 24. Hard Rules

Mandatory:

1. Never apply this style to markdown outside `/docs/**` unless explicitly requested.
2. Never rewrite `README.md` using this style by default.
3. Never rewrite `AGENTS.md` using this style by default.
4. Never rewrite `CHANGELOG.md` using this style by default.
5. Never treat all `.md` files as documentation files.
6. Never add emojis or decorative icons by default.
7. Never over-explain technical concepts with long analogies.
8. Never remove technical terms just to make text easier.
9. Never invent architecture, dependencies, metrics, or workflows.
10. Never include real secrets, keys, tokens, or credentials.
11. Never create wide tables with more than 4 columns unless necessary.
12. Never create huge diagrams that are harder to read than prose.
13. Never mix setup, architecture, workflow, debugging, and roadmap into one giant file if they deserve separate docs.
14. Never force `10/20/30` numbering onto a project that reads better with `01/02/03`.
15. Never leave duplicate sections or repeated ideas just because they existed in the source docs.
16. Never default to non-accented Vietnamese unless the project explicitly requires it.

## 25. Preferred Writing Patterns

Use:
- `Noi ngan gon, ...`
- `Muc dich cua phan nay la ...`
- `He thong dung [X] de [Y].`
- `[X] giup [Y], dac biet khi [Z].`
- `Diem can chu y la ...`
- `Dau hieu thuong thay la ...`
- `Nguyen nhan thuong gap la ...`
- `Huong xu ly la ...`
- `Danh doi cua cach nay la ...`
- `Trong luong thanh cong, ...`
- `Trong luong loi, ...`

Avoid:
- `Nhu chung ta da biet...`
- `Ve co ban thi...`
- `Rat don gian...`
- `Cuc ky manh me...`
- `Toi uu toan dien...`
- `Dam bao scale tot...`
- `AI tu hieu...`
- `Khong co van de gi...`

## 26. Minimal First Pass

If creating docs from scratch, start with:

```text
docs/
  01-start-here.md
  02-glossary.md
  03-project-overview.md
  04-system-map.md
  05-data-flow.md
  06-components.md
  07-core-workflows.md
  08-setup-and-run.md
  09-testing-debugging.md
  10-roadmap.md
```

Add more files only when:
- one file becomes too long
- a workflow needs dedicated explanation
- a bottleneck is important enough
- setup/deploy/debugging require separate treatment
- security/performance needs dedicated ownership

## 27. Final Quality Bar

A good `/docs/**` file should let a reader answer:
- file nay noi ve gi?
- phan nay nam o dau trong he thong?
- no giai quyet van de gi?
- luong binh thuong chay ra sao?
- khi loi thi loi o dau?
- dau hieu nhan biet la gi?
- sua hoac kiem tra the nao?
- co danh doi gi khong?
- doc tiep file nao?

If the file cannot answer these questions, improve structure before wording.
