export const meta = {
  name: 'team-flow',
  description: '스위치 퍼즐 팀 흐름: PD 브리프 → GDD → 컨텐츠↔스키마 → 병렬(코더·원화·UI) → 데이터 입력 → 코더 통합 → PD 검수',
  whenToUse: '새 기능·모드·컨텐츠처럼 여러 역할이 필요한 작업을 역할 에이전트(.claude/agents)로 진행할 때. 인자로 요청 내용(문자열)을 넘기고, 사용자 결정은 "사용자 결정: <항목> → <답>" 줄로 붙인다. switchpuzzle 저장소를 프로젝트로 연 세션에서만 동작한다.',
  phases: [
    { title: 'PD 브리프', detail: 'pd: 브리프·백로그·역할별 지시서(무엇을/왜/완료 기준/마감)' },
    { title: 'GDD', detail: 'game-architect: docs/design/gdd.md' },
    { title: '컨텐츠·스키마', detail: 'content-planner ↔ data-architect (최대 2회 왕복) + 채택된 룰 제안의 GDD 규격화' },
    { title: '병렬 제작', detail: 'coder 코어 로직+로더 / concept-artist 콘셉트 / ui-designer 와이어 → 원화·UI 교차 반영' },
    { title: '데이터 입력', detail: 'data-entry: data/ + docs/data/entry-report.md' },
    { title: '코더 통합', detail: 'coder: 데이터·UI·아트 통합, 테스트·타입 체크·빌드' },
    { title: 'PD 검수', detail: 'pd 판정 → 재작업(하류 포함) 1회 → 재검수' },
  ],
}

// ── 역할 ────────────────────────────────────────────────
const WORKERS = ['game-architect', 'content-planner', 'data-architect', 'coder', 'concept-artist', 'ui-designer', 'data-entry']
const LABEL = {
  pd: 'PD',
  'game-architect': '게임설계',
  'content-planner': '컨텐츠기획',
  'data-architect': '기획데이터',
  coder: '코더',
  'concept-artist': '원화',
  'ui-designer': 'UI',
  'data-entry': '데이터입력',
}
// 재작업·이슈 후속을 돌리는 순서: 산출물을 넘겨주는 역할이 먼저 (UI 규격 요청 → 원화, 코더는 모든 산출물을 쓰므로 마지막)
const FLOW_ORDER = ['game-architect', 'content-planner', 'data-architect', 'ui-designer', 'concept-artist', 'data-entry', 'coder']
// 이 역할의 산출물을 입력으로 쓰는 역할 (재작업 시 함께 확인).
// 순서와 반대 방향인 의존(원화→UI, 코더→데이터입력)은 afterRun 에서 따로 처리한다.
const DOWNSTREAM = {
  'game-architect': ['content-planner', 'data-architect', 'ui-designer', 'data-entry', 'coder'],
  'content-planner': ['data-architect', 'ui-designer', 'concept-artist', 'data-entry', 'coder'],
  'data-architect': ['data-entry', 'coder'],
  'ui-designer': ['concept-artist', 'coder'],
  'concept-artist': ['data-entry', 'coder'],
  'data-entry': ['coder'],
  coder: [],
}
const MAX_FOLLOW_UP_RUNS = 6
const OPEN_STATES = ['새로 올림', '열림']

// ── 출력 스키마 ─────────────────────────────────────────
const PATH_DESC = '저장소 루트 기준 상대 경로 (예: docs/design/gdd.md)'
const QUESTION_ITEM = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    blocking: { type: 'boolean', description: 'PD 답이 없으면 이 단계 산출물을 완성할 수 없을 때만 true' },
  },
  required: ['question', 'blocking'],
}
const ISSUE_ITEM = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'ISSUE-<에이전트 이름>-<번호>' },
    state: {
      type: 'string',
      enum: ['새로 올림', '열림', '결정됨', '해결됨'],
      description: '이번에 새로 올렸으면 "새로 올림", 이미 있던 이슈를 재사용했으면 docs/issues.md 의 현재 상태',
    },
    targetRole: { type: 'string', enum: [...WORKERS, 'pd'], description: '문제가 있는 산출물을 만든 역할' },
    target: { type: 'string', description: `문제가 있는 산출물 (${PATH_DESC})` },
    summary: { type: 'string' },
  },
  required: ['id', 'state', 'targetRole', 'target', 'summary'],
}
const REPORT_PROPS = {
  outputs: { type: 'array', items: { type: 'string' }, description: `작성·수정한 파일 (${PATH_DESC})` },
  summary: { type: 'string', description: '3줄 이내 요약' },
  assumptions: { type: 'array', items: { type: 'string' }, description: '"가정:"으로 명시한 내용. 없으면 빈 배열' },
  questions: { type: 'array', items: QUESTION_ITEM, description: 'PD에게 넘기는 질문. 없으면 빈 배열' },
  issues: { type: 'array', items: ISSUE_ITEM, description: '이번에 올렸거나 이미 있어서 재사용한 이슈. 없으면 빈 배열' },
  resolvedIssues: { type: 'array', items: { type: 'string' }, description: 'PD가 배정한 이슈 후속 중 이번에 반영한 ISSUE ID. 없으면 빈 배열' },
  checks: { type: 'array', items: { type: 'string' }, description: '실행한 검증 명령과 결과. 없으면 빈 배열' },
}
const REPORT_REQUIRED = Object.keys(REPORT_PROPS)
const REPORT = { type: 'object', properties: REPORT_PROPS, required: REPORT_REQUIRED }

const CONTENT_REPORT = {
  type: 'object',
  properties: {
    ...REPORT_PROPS,
    ruleProposals: {
      type: 'array',
      description: '"룰 변경 제안" 절에서 아직 PD 결정(D-번호)이 없는 제안만. 없으면 빈 배열',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '제안 제목 (문서와 같은 제목)' },
          summary: { type: 'string' },
          adjacencyCheck: { type: 'string', description: '"인접 교환만 가능" 규칙과의 충돌 검토 결과' },
        },
        required: ['title', 'summary', 'adjacencyCheck'],
      },
    },
  },
  required: [...REPORT_REQUIRED, 'ruleProposals'],
}

const USER_PROPS = {
  blockingForUser: {
    type: 'array',
    items: { type: 'string' },
    description: '여기에 넣으면 흐름이 멈춘다 — 사용자 결정 없이는 지금 진행할 수 없는 항목만. 없으면 빈 배열',
  },
  forUser: {
    type: 'array',
    items: { type: 'string' },
    description: '사용자에게 알리거나 나중에 확인받을 항목 (흐름은 계속된다). 없으면 빈 배열',
  },
}
const USER_REQUIRED = Object.keys(USER_PROPS)

const INSTRUCTION_PROPS = {
  what: { type: 'string', description: '무엇을' },
  why: { type: 'string', description: '왜' },
  done: { type: 'string', description: '완료 기준' },
  due: { type: 'string', description: '마감 (마일스톤 또는 날짜)' },
}

const BRIEF = {
  type: 'object',
  properties: {
    outputs: REPORT_PROPS.outputs,
    summary: REPORT_PROPS.summary,
    assumptions: REPORT_PROPS.assumptions,
    checks: REPORT_PROPS.checks,
    ordersFile: { type: 'string', description: '이번 요청의 지시서 (docs/pd/orders/<YYYY-MM-DD>-<주제>.md)' },
    orders: {
      type: 'array',
      description: '이번 요청에 참여할 역할에 대한 지시만. 지시가 없는 역할(코더는 지시가 없는 단계)은 흐름에서 건너뛴다. 한 역할에 여러 개 가능',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: WORKERS },
          stage: {
            type: 'string',
            enum: ['전체', '코어 로직+로더', '통합'],
            description: '코더 지시만 단계를 고른다. 다른 역할은 "전체"',
          },
          ...INSTRUCTION_PROPS,
        },
        required: ['role', 'stage', 'what', 'why', 'done', 'due'],
      },
    },
    carriedRoles: {
      type: 'array',
      items: { type: 'string', enum: WORKERS },
      description: '이어하기에서 이미 완료 기준을 채워 지시에서 뺐지만 산출물이 이번 요청 범위인 역할. 이어하기가 아니면 빈 배열',
    },
    ...USER_PROPS,
  },
  required: ['outputs', 'summary', 'assumptions', 'checks', 'ordersFile', 'orders', 'carriedRoles', ...USER_REQUIRED],
}

const PD_ANSWER = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          decision: { type: 'string' },
          decisionId: { type: 'string', description: '결정 로그 번호 D-n' },
        },
        required: ['question', 'decision', 'decisionId'],
      },
    },
    issueDecisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issue: { type: 'string', description: 'ISSUE-<에이전트 이름>-<번호>' },
          decision: { type: 'string' },
          assignee: { type: 'string', enum: [...WORKERS, '없음'], description: '후속 작업을 맡을 역할' },
          decisionId: { type: 'string' },
          ...INSTRUCTION_PROPS,
        },
        required: ['issue', 'decision', 'assignee', 'decisionId', 'what', 'why', 'done', 'due'],
      },
    },
    ...USER_PROPS,
  },
  required: ['answers', 'issueDecisions', ...USER_REQUIRED],
}

const RULE_DECISION = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '제안 제목 그대로' },
          adopted: { type: 'boolean' },
          alreadyDecided: { type: 'boolean', description: '결정 로그에 같은 제목의 결정이 이미 있어 그대로 돌려준 것이면 true' },
          decisionId: { type: 'string' },
          note: { type: 'string', description: '채택 범위 또는 보류/기각 이유' },
        },
        required: ['title', 'adopted', 'alreadyDecided', 'decisionId', 'note'],
      },
    },
    ...USER_PROPS,
  },
  required: ['decisions', ...USER_REQUIRED],
}

const REVIEW = {
  type: 'object',
  properties: {
    reviewFile: { type: 'string', description: '저장한 검수 코멘트 (docs/pd/reviews/<지시서 파일 이름>-r<차수>.md)' },
    verdicts: {
      type: 'array',
      description: '지시를 받은 역할과 이슈 후속 담당 역할마다 하나',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: WORKERS },
          result: { type: 'string', enum: ['통과', '재작업'] },
          reasons: { type: 'array', items: { type: 'string' }, description: '완료 기준 문장과 산출물을 대조한 근거' },
          what: { type: 'string', description: '재작업 지시: 무엇을 (통과면 빈 문자열)' },
          why: { type: 'string', description: '재작업 지시: 왜 (통과면 빈 문자열)' },
          done: { type: 'string', description: '재작업 지시: 완료 기준 (통과면 빈 문자열)' },
          due: { type: 'string', description: '재작업 지시: 마감 (통과면 빈 문자열)' },
        },
        required: ['role', 'result', 'reasons', 'what', 'why', 'done', 'due'],
      },
    },
    openIssues: { type: 'array', items: { type: 'string' }, description: '아직 열림·결정됨 상태인 이슈 (ISSUE ID: 요약)' },
    ...USER_PROPS,
    summary: { type: 'string', description: '사용자에게 보고할 요약' },
  },
  required: ['reviewFile', 'verdicts', 'openIssues', ...USER_REQUIRED, 'summary'],
}

// ── 입력 ────────────────────────────────────────────────
const isObj = args !== null && typeof args === 'object' && !Array.isArray(args)
const request = String((typeof args === 'string' ? args : isObj ? args.request : '') || '').trim()
if (!request) {
  throw new Error('요청 내용이 필요합니다. 예: /team-flow 제한 이동 모드에 par와 별점 도입')
}
const USER_DECISION_LINE = /^\s*사용자 결정\s*:\s*(.+)$/
const userDecisions = [
  ...new Set([
    ...(isObj && args.userDecisions ? [].concat(args.userDecisions).map(String) : []),
    ...request
      .split('\n')
      .map((l) => (l.match(USER_DECISION_LINE) || [])[1])
      .filter(Boolean)
      .map((l) => l.trim()),
  ]),
]

// ── 진행 상태 ───────────────────────────────────────────
const ledger = [] // { role, step, report }
const decisions = userDecisions.map((d) => `[사용자 결정] ${d}`) // 이후 모든 프롬프트의 "PD 결정 사항"
const decidedIssues = new Set()
const closedIssues = new Set() // 후속 없이 닫힌(또는 다음 지시서로 넘긴) 이슈
const followUps = [] // PD가 담당을 정한 이슈 결정 { issue, decision, assignee, decisionId, what, why, done, due, status }
const unanswered = [] // PD 답을 받지 못한 막힌 질문
const blockedAfterRetry = [] // PD 답을 반영해 재실행한 뒤에도 막힌 질문
const failed = [] // 결과 없이 끝난 단계
const blockingForUser = []
const forUser = []
const ranRoles = new Set()
const seenProposals = new Set()
let orders = []
let carried = new Set()
let ordersFile = '(아직 없음)'
let followUpRuns = 0

const has = (role) => orders.some((o) => o.role === role)
// 이번 요청 범위: 이번에 지시받았거나, 이어하기에서 이미 완료해 지시에서 빠진 역할
const inScope = (role) => has(role) || carried.has(role)
const coderHas = (stage) => orders.some((o) => o.role === 'coder' && (o.stage === '전체' || o.stage === stage))
const stopped = () => blockingForUser.length > 0
const bullet = (list, empty = '- (없음)') => (list.length ? list.map((x) => `- ${x}`).join('\n') : empty)
const uniq = (list) => [...new Set(list)]
const participants = () => uniq(orders.map((o) => o.role))
function repoPath(p) {
  const s = String(p).replace(/`/g, '').trim()
  const rel = s.startsWith('/') ? s.replace(/^.*?\/switchpuzzle\//, '') : s
  return rel.replace(/^\.\//, '')
}
const coreChanged = (report) =>
  report.outputs.map(repoPath).some((p) => /^(src\/(core|game|data)\/|scripts\/|package\.json$)/.test(p))
const reviewFileName = (round) =>
  `docs/pd/reviews/${(ordersFile.split('/').pop() || '지시서').replace(/\.md$/, '')}-r${round}.md`

function pushDecision(line) {
  if (!decisions.includes(line)) decisions.push(line)
}
function addUserItems(res) {
  blockingForUser.push(...res.blockingForUser)
  forUser.push(...res.forUser)
}

// PD 호출은 한 번에 하나씩 — 결정 로그(D-번호)·이슈 상태를 동시에 고치지 않게
let pdQueue = Promise.resolve()
function pdExclusive(fn) {
  const run = pdQueue.then(fn, fn)
  pdQueue = run.catch(() => {})
  return run
}

function instructionText(o) {
  return `무엇을: ${o.what}\n   왜: ${o.why}\n   완료 기준: ${o.done}\n   마감: ${o.due}`
}

function ordersText(role, stage) {
  const mine = orders.filter((o) => o.role === role && (!stage || o.stage === '전체' || o.stage === stage))
  if (!mine.length) return '(이번 단계에 대한 PD 지시 없음 — 아래 과제만 수행)'
  return mine.map((o, i) => `${i + 1}. [${o.stage}] ${instructionText(o)}`).join('\n')
}

function pendingFollowUps(role) {
  return followUps.filter((f) => f.assignee === role && f.status === '미실행')
}

function sharedContext() {
  const outs = []
  for (const e of ledger) {
    for (const p of e.report.outputs) outs.push(`${repoPath(p)} (${LABEL[e.role]} · ${e.step})`)
  }
  return [`선행 산출물:\n${bullet(uniq(outs), '- (아직 없음)')}`, `PD 결정 사항:\n${bullet(decisions)}`].join('\n\n')
}

function rolePrompt(role, step, task, stage, pending, ctx) {
  return [
    `스위치 퍼즐(switchpuzzle 저장소) 팀 작업 — 단계: ${step}`,
    `요청 원문: ${request}`,
    `지시서: ${ordersFile}`,
    `너에게 온 PD 지시:\n${ordersText(role, stage)}`,
    pending.length
      ? `PD가 너에게 배정한 이슈 후속 (반영하고 resolvedIssues 에 ID를 적어라):\n${pending
          .map((f) => `- ${f.issue} (${f.decisionId}) 결정: ${f.decision}\n   ${instructionText(f)}`)
          .join('\n')}`
      : '',
    `이번 단계 과제:\n${task}`,
    ctx,
    '역할 범위·산출물 위치·이슈 형식은 네 에이전트 정의와 CLAUDE.md를 따른다. 오늘 날짜가 필요하면 `date +%F`로 확인한다. 경로는 저장소 루트 기준 상대 경로로 적는다.',
    '마지막에 보고 항목을 구조화된 출력으로 채워라. PD 답이 없으면 산출물을 완성할 수 없는 질문만 blocking=true 로 표시한다.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ── 단계 실행기 ─────────────────────────────────────────
/** 역할 에이전트 1회 호출. 진행 상태는 바꾸지 않는다 (병렬에서 안전) */
async function callRole(role, step, phaseTitle, task, opts = {}) {
  const label = opts.label || `${LABEL[role]} · ${step}`
  const pending = opts.pending || pendingFollowUps(role)
  const prompt = rolePrompt(role, step, task, opts.stage, pending, opts.ctx || sharedContext())
  const schema = opts.schema || (role === 'content-planner' ? CONTENT_REPORT : REPORT)
  const report = await agent(prompt, { agentType: role, phase: phaseTitle, label, schema })
  if (!report) {
    failed.push(label)
    throw new Error(`${label} 단계가 결과 없이 끝났습니다`)
  }
  return { role, step, label, report, pending }
}

function record(res) {
  ledger.push({ role: res.role, step: res.step, report: res.report })
  ranRoles.add(res.role)
  // 반영했다고 보고한 후속만 완료. 아니면 한 번 더 전달하고, 두 번째에도 없으면 검수로 넘긴다
  for (const f of res.pending) {
    if (f.status !== '미실행') continue
    f.attempts = (f.attempts || 0) + 1
    if (res.report.resolvedIssues.includes(f.issue)) f.status = '실행됨'
    else if (f.attempts >= 2) f.status = '실행됨(미반영)'
  }
}

function mergeReports(a, b) {
  return {
    ...b,
    outputs: uniq([...a.outputs, ...b.outputs]),
    assumptions: uniq([...a.assumptions, ...b.assumptions]),
    issues: [...a.issues, ...b.issues.filter((i) => !a.issues.some((x) => x.id === i.id))],
    resolvedIssues: uniq([...a.resolvedIssues, ...b.resolvedIssues]),
    checks: [...a.checks, ...b.checks],
  }
}

const needsPd = (issue) => OPEN_STATES.includes(issue.state) && !decidedIssues.has(issue.id)

async function pdAnswer(role, step, phaseTitle, questions, issues) {
  const qs = questions.map((q) => `${q.blocking ? '[차단] ' : ''}${q.question}`)
  const is = issues.map((i) => `${i.id} | 대상: ${repoPath(i.target)} (${LABEL[i.targetRole]}) | ${i.summary}`)
  const prompt = [
    `스위치 퍼즐 팀 작업 — ${LABEL[role]}(${step})이 질문·이슈를 올렸다.`,
    `요청 원문: ${request}`,
    `지시서: ${ordersFile}`,
    `이번 요청 참여 역할: ${participants().map((r) => LABEL[r]).join(', ')}`,
    `질문:\n${bullet(qs)}`,
    `이슈 (docs/issues.md):\n${bullet(is)}`,
    sharedContext(),
    'PD로서 각 질문에 답하고 각 이슈를 결정하라. docs/issues.md 에서 이미 "결정됨 (D-n)"인 이슈는 새로 결정하지 말고 그 D-번호·결정을 그대로 적고 assignee="없음"으로 둬라. 새 결정은 docs/pd/decisions.md 에 D-번호로 기록하고, 이슈 상태 칸을 "결정됨 (D-번호)"로 바꿔라. 후속이 필요 없는 결정(기각·현행 유지)은 "해결됨 (D-번호)"·[x]로 바꿔라.',
    '이슈 후속 작업을 맡길 역할은 참여 역할 중에서 먼저 고르고, assignee 와 무엇을/왜/완료 기준/마감을 채워라(참여하지 않은 역할에 배정하면 그 역할이 이번 흐름에서 따로 한 번 돈다). 맡길 역할이 없으면 assignee="없음", 네 항목은 빈 문자열.',
    '사용자만 정할 수 있는 것은 결정하지 말고, 지금 진행을 막는 것만 blockingForUser, 나머지는 forUser 에 넣어라.',
  ].join('\n\n')
  const ans = await pdExclusive(() =>
    agent(prompt, { agentType: 'pd', phase: phaseTitle, label: `PD 답변 ← ${LABEL[role]}`, schema: PD_ANSWER }),
  )
  if (!ans) {
    failed.push(`PD 답변 ← ${LABEL[role]} · ${step}`)
    return null
  }
  for (const a of ans.answers) pushDecision(`${a.decisionId} [${LABEL[role]} 질문] ${a.question} → ${a.decision}`)
  for (const d of ans.issueDecisions) {
    decidedIssues.add(d.issue)
    pushDecision(`${d.decisionId} [${d.issue}] ${d.decision} (담당: ${d.assignee === '없음' ? '없음' : LABEL[d.assignee]})`)
    const known = followUps.some((f) => f.issue === d.issue && f.decisionId === d.decisionId)
    if (d.assignee !== '없음' && !known) followUps.push({ ...d, status: '미실행', attempts: 0 })
    if (d.assignee === '없음') closedIssues.add(d.issue)
  }
  addUserItems(ans)
  return ans
}

/** 호출 결과 정리: 기록 → 질문·새 이슈는 PD에게 → 막힌 질문에 답이 오면 한 번 재실행 */
async function settle(res, phaseTitle, task, opts = {}) {
  record(res)
  let report = res.report
  const fresh = report.issues.filter(needsPd)
  if (!report.questions.length && !fresh.length) return report

  const ans = await pdAnswer(res.role, res.step, phaseTitle, report.questions, fresh)
  const blocking = report.questions.filter((q) => q.blocking)
  if (!blocking.length) return report
  if (!ans || !ans.answers.length || stopped()) {
    unanswered.push(...blocking.map((q) => `${res.label}: ${q.question}`))
    return report
  }

  const answered = ans.answers.map((a) => `- Q: ${a.question}\n  A (${a.decisionId}): ${a.decision}`).join('\n')
  const retryTask = [
    task,
    `막혔던 질문에 대한 PD 답변:\n${answered}`,
    `답변을 반영해 산출물을 완성하라. 이전 산출물: ${report.outputs.map(repoPath).join(', ') || '없음'}`,
  ].join('\n\n')
  const again = await callRole(res.role, `${res.step} (PD 답변 반영)`, phaseTitle, retryTask, {
    ...opts,
    ctx: undefined,
    pending: [...res.pending, ...pendingFollowUps(res.role)],
    label: `${res.label} (재실행)`,
  })
  record(again)
  report = mergeReports(report, again.report)
  const freshAgain = again.report.issues.filter(needsPd)
  if (again.report.questions.length || freshAgain.length) {
    await pdAnswer(res.role, `${res.step} (재실행)`, phaseTitle, again.report.questions, freshAgain)
    blockedAfterRetry.push(...again.report.questions.filter((q) => q.blocking).map((q) => `${res.label}: ${q.question}`))
  }
  return report
}

async function runRole(role, step, phaseTitle, task, opts = {}) {
  const res = await callRole(role, step, phaseTitle, task, opts)
  return settle(res, phaseTitle, task, opts)
}

/** 실패해도 흐름을 이어가는 보조 실행 */
async function tryRunRole(role, step, phaseTitle, task, opts = {}) {
  try {
    return await runRole(role, step, phaseTitle, task, opts)
  } catch (err) {
    log(`${LABEL[role]} · ${step} 실패: ${err.message}`)
    return null
  }
}

async function decideRuleProposals(label, proposals, phaseTitle) {
  const fresh = proposals.filter((p) => !seenProposals.has(p.title))
  if (!fresh.length) return []
  const prompt = [
    `스위치 퍼즐 팀 작업 — 룰 변경 제안 채택 결정 (${label})`,
    `요청 원문: ${request}`,
    `지시서: ${ordersFile}`,
    `제안:\n${bullet(fresh.map((p) => `${p.title}: ${p.summary} (인접 교환 규칙 검토: ${p.adjacencyCheck})`))}`,
    sharedContext(),
    '제안마다 채택/보류·기각을 정하고 docs/pd/decisions.md 에 D-번호로 기록하라. 결정 로그에 같은 제목의 결정이 이미 있으면 새로 기록하지 말고 그 결정을 alreadyDecided=true 로 그대로 돌려줘라. 채택한 것은 게임설계 아키텍터가 GDD에 규격화한다. "인접 교환만 가능" 규칙과 충돌하는 제안은 채택하지 않는다.',
    '사용자만 정할 수 있는 것은 결정하지 말고, 지금 진행을 막는 것만 blockingForUser, 나머지는 forUser 에 넣어라.',
  ].join('\n\n')
  const rd = await pdExclusive(() =>
    agent(prompt, { agentType: 'pd', phase: phaseTitle, label: `PD 룰 제안 결정 (${label})`, schema: RULE_DECISION }),
  )
  if (!rd) {
    failed.push(`PD 룰 제안 결정 (${label})`)
    return []
  }
  fresh.forEach((p) => seenProposals.add(p.title))
  for (const d of rd.decisions) {
    pushDecision(`${d.decisionId} [룰 제안] ${d.title} → ${d.adopted ? '채택' : '보류/기각'} (${d.note})`)
  }
  addUserItems(rd)
  return rd.decisions.filter((d) => d.adopted && !d.alreadyDecided)
}

/** 룰 제안 결정 → 채택분 GDD 규격화. 규격화했으면 채택 목록을 돌려준다 */
async function handleProposals(label, proposals, phaseTitle) {
  const adopted = await decideRuleProposals(label, proposals || [], phaseTitle)
  if (!adopted.length) return []
  const titles = adopted.map((d) => d.title).join(', ')
  if (stopped()) {
    forUser.push(`채택된 룰 제안(${titles})이 GDD 규격화 전에 흐름이 멈춰 규격화되지 않음`)
    return []
  }
  if (!inScope('game-architect')) {
    forUser.push(`채택된 룰 제안(${adopted.map((d) => d.title).join(', ')})이 이번 요청에 게임설계 지시가 없어 GDD에 규격화되지 않음`)
    log('채택된 룰 제안이 있으나 게임설계 지시가 없어 규격화 생략 — 결과에 표시')
    return []
  }
  const done = await tryRunRole(
    'game-architect',
    `룰 제안 규격화 (${label})`,
    phaseTitle,
    `PD가 채택한 컨텐츠기획 제안을 docs/design/gdd.md 에 규격화하라 (코어 룰·상태/전이·의사코드·엣지케이스·데이터로 뺄 항목 목록 갱신):\n${bullet(adopted.map((d) => `${d.title} (${d.decisionId}): ${d.note}`))}`,
  )
  if (!done) {
    forUser.push(`채택된 룰 제안(${titles})의 GDD 규격화가 실패함`)
    return []
  }
  if (phaseTitle !== '컨텐츠·스키마') {
    forUser.push(`${phaseTitle} 단계에서 룰 제안(${titles})이 GDD에 규격화됨 — 스키마·데이터·코드 반영은 검수에서 확인 필요`)
  }
  return adopted
}

/** 순서와 반대 방향인 의존을 메운다: 컨텐츠 제안 결정, 원화 변경 → UI 대조, 코어 변경 → 시드·par 재계산 */
async function afterRun(role, report, phaseTitle) {
  const extra = []
  if (!report || stopped()) return extra
  if (role === 'content-planner' && report.ruleProposals && report.ruleProposals.length) {
    const formalized = await handleProposals(`${LABEL[role]} ${phaseTitle}`, report.ruleProposals, phaseTitle)
    if (formalized.length) extra.push('game-architect')
  }
  const artChanged = report.outputs.map(repoPath).some((p) => p.startsWith('docs/art/'))
  if (role === 'concept-artist' && artChanged && inScope('ui-designer') && !stopped()) {
    const r = await tryRunRole(
      'ui-designer',
      '아트 디렉션 재대조',
      phaseTitle,
      '원화 산출물(docs/art/)이 바뀌었다. docs/art/art-direction.md 와 docs/ui/ui-spec.md 를 다시 대조해 화면·인터랙션 범위 안에서 맞추고, 아트 콘셉트와 충돌하는 부분은 원화 대상 이슈로 올려라. 바꿀 것이 없으면 요약에 "변경 없음"이라고 적어라.',
    )
    if (r) extra.push('ui-designer')
  }
  if (role === 'coder' && coreChanged(report) && inScope('data-entry') && !stopped()) {
    const r = await tryRunRole(
      'data-entry',
      '코어 변경 반영',
      phaseTitle,
      '코더가 코어 로직·로더·스크립트를 바꿨다. README.md 의 스크립트로 data/ 의 시드→초기 배치·par 를 다시 계산하고 재검증해 docs/data/entry-report.md 를 갱신하라. 바뀐 값이 없으면 요약에 "변경 없음"이라고 적어라.',
    )
    if (r) extra.push('data-entry')
  }
  return extra
}

/** 차례가 지난 역할(또는 이번 요청에 없는 역할)에 배정된 이슈 후속을 실행한다. 실행한 역할 목록을 돌려준다 */
async function runFollowUps(phaseTitle, eligible) {
  const ran = []
  for (const role of FLOW_ORDER) {
    if (!eligible.includes(role)) continue
    const pending = pendingFollowUps(role)
    if (!pending.length) continue
    if (followUpRuns >= MAX_FOLLOW_UP_RUNS) {
      log(`이슈 후속 실행 한도(${MAX_FOLLOW_UP_RUNS}회) 도달 — ${LABEL[role]} 후속 ${pending.length}건은 검수로 넘김`)
      continue
    }
    followUpRuns++
    const report = await tryRunRole(
      role,
      '이슈 후속',
      phaseTitle,
      'PD가 배정한 이슈 후속을 반영하라. 반영한 ISSUE ID를 resolvedIssues 에 적어라. 선행 산출물이 바뀌었으면 함께 확인하라.',
    )
    if (report) {
      ran.push(role)
      ran.push(...(await afterRun(role, report, phaseTitle)))
    }
    if (stopped()) break
  }
  return ran
}

async function pdReview(round, previous) {
  const reports = ledger
    .filter((e) => e.role !== 'pd')
    .map((e) =>
      [
        `### ${LABEL[e.role]} · ${e.step}`,
        `요약: ${e.report.summary}`,
        `산출물: ${e.report.outputs.map(repoPath).join(', ') || '없음'}`,
        `가정: ${e.report.assumptions.join(' / ') || '없음'}`,
        `반영한 이슈: ${e.report.resolvedIssues.join(', ') || '없음'}`,
        `검증: ${e.report.checks.join(' / ') || '없음'}`,
      ].join('\n'),
    )
  const follow = followUps.map((f) => `${f.issue} → ${LABEL[f.assignee]} (${f.status}): ${f.decision}`)
  const prompt = [
    `스위치 퍼즐 팀 작업 — PD 검수 ${round}차`,
    `요청 원문: ${request}`,
    `지시서: ${ordersFile}`,
    previous ? `1차 검수 코멘트: ${repoPath(previous.reviewFile)}` : '',
    `역할별 보고:\n\n${reports.join('\n\n') || '(보고 없음)'}`,
    `실패한 단계:\n${bullet(failed)}`,
    `PD 답을 받지 못한 막힌 질문:\n${bullet(unanswered)}`,
    `PD 답변 반영 뒤에도 막힌 질문:\n${bullet(blockedAfterRetry)}`,
    `이슈 후속 (담당 · 실행 여부):\n${bullet(follow)}`,
    sharedContext(),
    `지시서의 완료 기준 문장과 실제 산출물 파일을 직접 열어 대조해, 지시를 받은 역할과 이슈 후속 담당 역할마다 통과/재작업을 판정하라. 상류 역할을 재작업으로 판정하면 그 산출물을 쓰는 하류 역할도 확인하라. 후속 작업이 반영된 이슈는 docs/issues.md 에서 "해결됨"·[x]로 바꿔라. 검수 코멘트는 ${reviewFileName(round)} 로 저장하라(이미 있으면 덮어쓰지 말고 끝에 -2, -3…).`,
    round > 1
      ? '이번은 재작업 뒤의 재검수다. 더 돌리지 않으니, 남은 재작업과 열린 이슈를 사용자에게 보고할 요약에 담아라.'
      : '재작업 판정에는 무엇을/왜/완료 기준/마감을 구체적으로 적어라. 한 번의 재작업으로 해결할 수 있어야 한다.',
    '사용자만 정할 수 있는 것은 지금 진행을 막는 것만 blockingForUser, 나머지는 forUser 에 넣어라.',
  ]
    .filter(Boolean)
    .join('\n\n')
  const result = await pdExclusive(() =>
    agent(prompt, { agentType: 'pd', phase: 'PD 검수', label: `PD · 검수 ${round}차`, schema: REVIEW }),
  )
  if (!result) {
    failed.push(`PD · 검수 ${round}차`)
    throw new Error(`PD 검수 ${round}차가 결과 없이 끝났습니다`)
  }
  addUserItems(result)
  return result
}

function finish(status, lastReview = null) {
  return {
    status,
    request,
    ordersFile,
    participants: participants(),
    steps: ledger.map((e) => ({
      role: e.role,
      step: e.step,
      outputs: e.report.outputs.map(repoPath),
      summary: e.report.summary,
      checks: e.report.checks,
    })),
    decisions,
    followUps: followUps.map((f) => ({ issue: f.issue, assignee: f.assignee, status: f.status, decision: f.decision })),
    unansweredQuestions: unanswered,
    blockedAfterRetry,
    failedSteps: failed,
    blockingForUser: uniq(blockingForUser),
    forUser: uniq(forUser),
    review: lastReview && {
      file: repoPath(lastReview.reviewFile),
      verdicts: lastReview.verdicts,
      openIssues: lastReview.openIssues,
      summary: lastReview.summary,
    },
  }
}

const STOP_FOR_USER = '사용자 확인 필요 — 진행 중단 (blockingForUser 에 답한 뒤 "사용자 결정:" 줄을 붙여 다시 실행)'

// ── 흐름 ────────────────────────────────────────────────
let review = null
try {
  // 1. PD 브리프
  phase('PD 브리프')
  const brief = await pdExclusive(() =>
    agent(
      [
        '스위치 퍼즐(switchpuzzle 저장소) 팀 작업 — 단계: PD 브리프',
        `요청 원문: ${request}`,
        userDecisions.length
          ? `사용자 결정 (이어하기 — 같은 요청의 지시서가 있으면 새로 만들지 말고 갱신하고, 이미 완료 기준을 채운 역할은 지시에서 빼고 carriedRoles 에 넣어라):\n${bullet(userDecisions)}`
          : '',
        'docs/pd/brief.md 가 없으면(첫 실행) 요청과 관계없이 프로토타입 기준 제품 목표·MVP 범위·마일스톤부터 쓰고, 게임설계 지시에 GDD 전체 절 작성을, 기획데이터 지시에 스키마 전체 초안을 넣어라. 있으면 이번 요청에 맞게 브리프와 우선순위 백로그(docs/pd/backlog.md)를 갱신하라.',
        'docs/issues.md 의 열림·결정됨 항목과 docs/pd/decisions.md 를 읽고, 이번 지시서에 넣거나 보류 이유를 지시서에 적어라. 두 파일이 없으면 지금 만들어라. 사용자 결정은 출처=사용자로 결정 로그에 기록하되(이미 있으면 새로 쓰지 않는다) 다시 묻지 마라.',
        '이번 요청의 지시서를 docs/pd/orders/<YYYY-MM-DD>-<주제>.md 에 쓰고(날짜는 `date +%F`, 이어하기가 아닌데 같은 이름이 있으면 -2, -3…), 참여할 역할마다 "무엇을 / 왜 / 완료 기준 / 마감" 4항목 지시를 orders 로 돌려줘라. 완료 기준에 커밋·푸시는 넣지 않는다.',
        '흐름: PD 브리프 → 게임설계(GDD) → 컨텐츠기획 ↔ 기획데이터(스키마) → 병렬[코더: 코어 로직+로더 / 원화: 콘셉트 / UI: 와이어] → 원화·UI 교차 반영 → 게임데이터입력 → 코더 통합 → PD 검수. 필요 없는 역할은 orders 에서 빼면 건너뛴다. 코더 지시는 stage 를 "코어 로직+로더" 또는 "통합"으로 나눠 적어라(둘 다면 "전체"). 지시가 없는 코더 단계는 실행되지 않는다.',
        '데이터입력을 지시하는데 README.md 에 시드→초기 배치·par 계산 스크립트나 데이터 검사 스크립트가 없으면, 코더 "코어 로직+로더" 지시에 그 스크립트를 넣어라.',
        '사용자만 정할 수 있는 것은 결정하지 말고, 지금 진행을 막는 것만 blockingForUser(흐름이 멈춘다), 나머지는 forUser 에 넣어라.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      { agentType: 'pd', phase: 'PD 브리프', label: 'PD · 브리프·지시서', schema: BRIEF },
    ),
  )
  if (!brief) {
    failed.push('PD · 브리프·지시서')
    throw new Error('PD 브리프 단계가 결과 없이 끝났습니다')
  }
  ledger.push({ role: 'pd', step: '브리프', report: { ...brief, questions: [], issues: [], resolvedIssues: [] } })
  orders = brief.orders
  carried = new Set(brief.carriedRoles.filter((r) => !has(r)))
  ordersFile = repoPath(brief.ordersFile)
  addUserItems(brief)
  if (stopped()) return finish(STOP_FOR_USER)
  if (!orders.length) return finish('PD가 이번 요청에 참여할 역할을 지정하지 않음')

  log(`참여: ${participants().map((r) => LABEL[r]).join(', ')}${carried.size ? ` / 이어하기 완료 역할: ${[...carried].map((r) => LABEL[r]).join(', ')}` : ''}`)
  const skipped = WORKERS.filter((r) => !has(r))
  if (skipped.length) log(`지시 없음 → 건너뜀: ${skipped.map((r) => LABEL[r]).join(', ')}`)
  if (has('coder') && !coderHas('코어 로직+로더')) log('코더 "코어 로직+로더" 지시 없음 → 병렬 단계의 코더 작업 건너뜀')
  if (has('coder') && !coderHas('통합')) log('코더 "통합" 지시 없음 → 코더 통합 단계 건너뜀')
  if (has('data-entry') && !coderHas('코어 로직+로더')) {
    forUser.push('데이터입력이 참여하지만 코더 "코어 로직+로더" 지시가 없음 — README.md 에 시드·par 계산 스크립트가 없으면 해당 값은 미입력으로 남는다')
  }

  // 2. GDD
  if (has('game-architect')) {
    phase('GDD')
    await runRole(
      'game-architect',
      'GDD',
      'GDD',
      'docs/design/gdd.md 를 작성하거나 갱신하라. 절 순서: 용어 정의 → 코어 룰(되돌리기 포함) → 상태/전이 표 → 의사코드 → 스테이지 생성 규칙 → 별점·난이도 지표 → 엣지케이스 목록 → 데이터로 뺄 항목 목록 → (부록) 프로토타입과의 차이. 이번 요청과 관련된 절을 우선하되, 지시서가 전체 작성을 요구하면 모든 절을 채워라.',
    )
    if (stopped()) return finish(STOP_FOR_USER)
  }

  // 3. 컨텐츠기획 ↔ 기획데이터 (+ 채택된 룰 제안의 GDD 규격화)
  let contentRefreshed = false
  if (has('content-planner') || has('data-architect')) {
    phase('컨텐츠·스키마')
    let runContent = has('content-planner')
    let runSchema = has('data-architect')
    let feedback = ''
    let formalized = []
    for (let round = 1; round <= 2; round++) {
      formalized = []
      if (runContent) {
        const content = await runRole(
          'content-planner',
          `컨텐츠 기획 ${round}차`,
          '컨텐츠·스키마',
          `컨텐츠 기획서·스테이지 리스트·튜토리얼 시나리오를 작성하거나 갱신하라. 기획서의 "룰 변경 제안" 절(제안마다 PD 결정 표시)과 끝의 "데이터로 필요한 항목" 절을 최신으로 유지하고, 아직 결정이 없는 제안을 ruleProposals 로 돌려줘라.${feedback}`,
        )
        if (stopped()) return finish(STOP_FOR_USER)
        formalized = await handleProposals(`${round}차`, content.ruleProposals, '컨텐츠·스키마')
        if (stopped()) return finish(STOP_FOR_USER)
      }

      let contentIssues = []
      if (runSchema) {
        const schema = await runRole(
          'data-architect',
          `스키마 ${round}차`,
          '컨텐츠·스키마',
          [
            inScope('content-planner')
              ? 'GDD의 "데이터로 뺄 항목 목록"과 컨텐츠 기획의 "데이터로 필요한 항목"을 받아'
              : 'GDD의 "데이터로 뺄 항목 목록"을 받아 (컨텐츠 기획은 이번 요청 범위가 아니다 — 기존 파일이 있으면 참고만)',
            'docs/data/schema.md 와 data/templates/ 를 작성하거나 갱신하라. 컨텐츠 기획에 빠지거나 모순된 항목은 targetRole=content-planner, 규칙 문제는 targetRole=game-architect 로 이슈를 올려라.',
          ].join(' '),
        )
        if (stopped()) return finish(STOP_FOR_USER)
        contentIssues = schema.issues.filter(
          (i) =>
            OPEN_STATES.includes(i.state) &&
            !closedIssues.has(i.id) &&
            (i.targetRole === 'content-planner' || repoPath(i.target).startsWith('docs/content/')),
        )
      }

      if (round === 2) break
      const gddChanged = (await runFollowUps('컨텐츠·스키마', ['game-architect'])).length > 0
      if (stopped()) return finish(STOP_FOR_USER)
      runContent =
        has('content-planner') &&
        (contentIssues.length > 0 ||
          formalized.length > 0 ||
          gddChanged ||
          pendingFollowUps('content-planner').length > 0)
      runSchema = has('data-architect') && (runContent || gddChanged || pendingFollowUps('data-architect').length > 0)
      if (!runContent && !runSchema) break
      log(`2차 왕복 — 컨텐츠 이슈 ${contentIssues.length}건, 채택·규격화 ${formalized.length}건, GDD 후속 ${gddChanged ? '있음' : '없음'}`)
      feedback = [
        contentIssues.length
          ? `\n\n기획데이터 아키텍터가 올린 이슈 (PD 결정은 "PD 결정 사항" 참고):\n${bullet(contentIssues.map((i) => `${i.id}: ${i.summary}`))}`
          : '',
        formalized.length
          ? `\n\nPD가 채택하고 GDD에 규격화한 제안 — 이제 스테이지 리스트·튜토리얼·"데이터로 필요한 항목"에 반영하라:\n${bullet(formalized.map((d) => `${d.title} (${d.decisionId})`))}`
          : '',
        gddChanged ? '\n\nGDD가 이슈 후속으로 바뀌었다 — 스테이지 리스트·튜토리얼과 대조하라.' : '',
      ].join('')
      formalized = []
    }

    // 2차에서 채택·규격화된 제안은 왕복 한도 밖이므로 컨텐츠에 한 번 더 반영시킨다
    if (formalized.length && has('content-planner')) {
      const reflected = await tryRunRole(
        'content-planner',
        '채택 제안 반영',
        '컨텐츠·스키마',
        `PD가 채택하고 GDD에 규격화한 제안을 스테이지 리스트·튜토리얼·"데이터로 필요한 항목"에 반영하라:\n${bullet(formalized.map((d) => `${d.title} (${d.decisionId})`))}`,
      )
      if (stopped()) return finish(STOP_FOR_USER)
      if (reflected) contentRefreshed = true
    }
  }

  // 병렬 단계 전 경계 (항상): 남은 게임설계·컨텐츠·기획데이터 후속 → 바뀌었으면 스키마 재확인
  {
    const ranBefore = await runFollowUps('컨텐츠·스키마', ['game-architect', 'content-planner', 'data-architect'])
    if (stopped()) return finish(STOP_FOR_USER)
    const upstreamChanged = contentRefreshed || ranBefore.includes('game-architect') || ranBefore.includes('content-planner')
    if (upstreamChanged && inScope('data-architect') && !ranBefore.includes('data-architect')) {
      await tryRunRole(
        'data-architect',
        '스키마 갱신 확인',
        '컨텐츠·스키마',
        'GDD 또는 컨텐츠 기획이 이슈 후속·제안 반영으로 바뀌었다. docs/design/gdd.md 와 docs/content/ 의 변경을 확인해 docs/data/schema.md 와 data/templates/ 에 반영하라. 반영할 것이 없으면 요약에 "변경 없음"이라고 적어라.',
      )
      if (stopped()) return finish(STOP_FOR_USER)
    }
  }

  // 4. 병렬 제작 — 호출만 동시에, 결과 정리는 정해진 순서로 (재개 시 뒤 단계 프롬프트가 흔들리지 않게)
  const artAndUi = has('concept-artist') && has('ui-designer')
  const pairNote = artAndUi
    ? ' 원화와 UI가 동시에 작업 중이다. 상대 산출물에 의존하는 부분은 [차단] 질문 대신 "가정:"으로 적어라 (병렬 뒤 교차 반영 단계가 있다).'
    : ''
  const jobs = []
  if (coderHas('코어 로직+로더')) {
    jobs.push({
      role: 'coder',
      step: '코어 로직+로더',
      opts: { stage: '코어 로직+로더' },
      task: [
        'PD 지시 범위 안에서 GDD와 데이터 스키마에 맞춰 코어 로직(src/core, src/game)과 데이터 로더(src/data)를 구현·수정하고 단위 테스트(tests/)를 추가하라. "인접하지 않은 교환은 거부" 테스트는 필수다.',
        '화면·인터랙션(src/ui)은 이 단계에서 바꾸지 않는다. 코어 API 변경으로 src/ui 가 컴파일되지 않으면 호출부만 최소한으로 맞춘다. 통합 단계 몫의 완료 기준은 이번에 다루지 않는다.',
        'PD 지시에 시드→초기 배치·par 계산 스크립트나 데이터 검사 스크립트가 있으면 npm 스크립트로 제공하고 사용법을 README.md 에 적어라.',
        'npm test 와 npm run typecheck 결과를 checks 에 적어라.',
      ].join(' '),
    })
  }
  if (has('concept-artist')) {
    jobs.push({
      role: 'concept-artist',
      step: '콘셉트',
      opts: {},
      task: `아트 디렉션, 콘셉트 시트, 리소스 네이밍·규격 표를 작성하거나 갱신하라. 테마 목록은 docs/content/ 에서 읽어라.${pairNote}`,
    })
  }
  if (has('ui-designer')) {
    jobs.push({
      role: 'ui-designer',
      step: '와이어',
      opts: {},
      task: [
        'docs/ui/ui-spec.md 를 에이전트 정의의 절 순서대로 작성하거나 갱신하라(src/ui/screens 기능의 유지/변경/삭제 제안 표 포함).',
        inScope('content-planner')
          ? '튜토리얼 안내 절은 docs/content/tutorial.md 의 단계에 맞춰 표시 방식만 정하라.'
          : '튜토리얼 안내 절은 docs/content/tutorial.md 가 있으면 그 단계에 맞춰 표시 방식만 정하고, 없으면 "시나리오 없음 — 보류"로 둬라.',
        `원화에 필요한 리소스는 "규격 요청" 절에 적어라.${pairNote}`,
      ].join(' '),
    })
  }
  if (jobs.length) {
    phase('병렬 제작')
    const ctx = sharedContext()
    const raw = await parallel(jobs.map((j) => () => callRole(j.role, j.step, '병렬 제작', j.task, { ...j.opts, ctx })))
    const lost = raw.filter((r) => r === null).length
    if (lost) log(`병렬 제작 ${jobs.length}개 중 ${lost}개가 실패 — 검수에 넘김`)
    for (let i = 0; i < jobs.length; i++) {
      if (!raw[i]) continue
      try {
        await settle(raw[i], '병렬 제작', jobs[i].task, jobs[i].opts)
      } catch (err) {
        log(`${raw[i].label} 정리 중 실패: ${err.message}`)
      }
      if (stopped()) {
        // 이미 끝난 나머지 결과도 보고에 남긴다 (PD 호출 없이)
        for (let k = i + 1; k < jobs.length; k++) {
          if (!raw[k]) continue
          record(raw[k])
          const rk = raw[k].report
          unanswered.push(...rk.questions.map((q) => `${raw[k].label}: ${q.blocking ? '[차단] ' : ''}${q.question}`))
          const open = rk.issues.filter(needsPd).map((x) => x.id)
          if (open.length) forUser.push(`중단으로 PD가 처리하지 못한 이슈: ${open.join(', ')}`)
        }
        return finish(STOP_FOR_USER)
      }
    }

    // 원화 ↔ UI 교차 반영 (원문: 원화는 UI 규격 요청을, UI는 아트 디렉션을 받는다)
    if (artAndUi && ranRoles.has('concept-artist') && ranRoles.has('ui-designer')) {
      await tryRunRole(
        'concept-artist',
        'UI 규격 요청 반영',
        '병렬 제작',
        'docs/ui/ui-spec.md 의 "규격 요청" 절을 읽고 docs/art/resource-spec.md 에 반영하라. 반영할 수 없는 요청은 targetRole=ui-designer 로 이슈를 올려라.',
      )
      if (stopped()) return finish(STOP_FOR_USER)
      await tryRunRole(
        'ui-designer',
        '아트 디렉션 대조',
        '병렬 제작',
        'docs/art/art-direction.md 와 docs/ui/ui-spec.md 를 대조하라. "가정:"으로 적었던 부분을 확정하고, 화면·인터랙션 범위 안에서 맞출 것은 반영하라. 아트 콘셉트와 충돌하는 부분은 targetRole=concept-artist 로 이슈를 올려라.',
      )
      if (stopped()) return finish(STOP_FOR_USER)
    }
    await runFollowUps('병렬 제작', ['game-architect', 'content-planner', 'data-architect', 'ui-designer', 'concept-artist'])
    if (stopped()) return finish(STOP_FOR_USER)
  }

  // 5. 데이터 입력
  if (has('data-entry')) {
    phase('데이터 입력')
    await runRole(
      'data-entry',
      '데이터 입력',
      '데이터 입력',
      '템플릿·작성 가이드·스테이지 리스트·par 계산 규칙에 맞춰 data/ 의 데이터를 채우고, 검증 결과·채우지 못한 항목·난이도 커브 요약 표를 docs/data/entry-report.md 에 적어라. 시드→초기 배치와 배치에 따라 달라지는 par 는 README.md 의 코더 제공 스크립트로 계산하라. 검증에 쓴 명령과 결과를 checks 에 적어라.',
    )
    if (stopped()) return finish(STOP_FOR_USER)
  }

  // 코더 통합 전 경계 (항상): 코더를 뺀 모든 역할의 남은 후속
  await runFollowUps('데이터 입력', FLOW_ORDER.filter((r) => r !== 'coder'))
  if (stopped()) return finish(STOP_FOR_USER)

  // 6. 코더 통합
  if (coderHas('통합')) {
    phase('코더 통합')
    const parts = [
      inScope('data-entry') ? '완성 데이터(data/)를 src/data 로더로 읽어 게임에 연결' : '',
      inScope('ui-designer') ? 'UI 명세(docs/ui/ui-spec.md)를 화면(src/ui)으로 구현(튜토리얼은 tutorial.md 의 단계·조건과 UI 명세의 표시 방식을 따른다)' : '',
      inScope('concept-artist') ? '아트 리소스 규격(docs/art/resource-spec.md) 반영' : '',
    ].filter(Boolean)
    const integrated = await runRole(
      'coder',
      '통합',
      '코더 통합',
      [
        parts.length ? `${parts.join(', ')}하라.` : 'PD 지시의 통합 단계 몫을 구현하라.',
        '이번 요청 범위가 아닌 역할의 산출물은 기존 파일이 있으면 참고만 한다.',
        'README.md 의 빌드·실행 방법을 갱신하라. npm test, npm run typecheck, npm run build 를 실행하고 결과를 checks 에 그대로 적어라.',
      ].join(' '),
      { stage: '통합' },
    )
    if (stopped()) return finish(STOP_FOR_USER)
    await afterRun('coder', integrated, '코더 통합')
    if (stopped()) return finish(STOP_FOR_USER)
  }
  await runFollowUps('코더 통합', FLOW_ORDER)
  if (stopped()) return finish(STOP_FOR_USER)

  // 7. PD 검수 → 재작업(하류 포함) 1회 → 재검수
  phase('PD 검수')
  review = await pdReview(1, null)
  if (stopped()) return finish(STOP_FOR_USER, review)
  const flagged = review.verdicts.filter((v) => v.result === '재작업')
  if (!flagged.length) return finish('완료 — PD 검수 통과', review)

  const reworkSet = new Map(flagged.map((v) => [v.role, v]))
  const upstreamOf = new Map() // 역할 → 이 역할의 입력을 바꾼 재작업 역할들
  const queue = [...reworkSet.keys()]
  while (queue.length) {
    const r = queue.shift()
    for (const d of DOWNSTREAM[r]) {
      if (!(inScope(d) || ranRoles.has(d))) continue
      // 통합 지시가 없는 코더는 화면·아트 변경의 하류가 아니다
      if (d === 'coder' && ['ui-designer', 'concept-artist'].includes(r) && !coderHas('통합')) continue
      upstreamOf.set(d, uniq([...(upstreamOf.get(d) || []), r]))
      if (!reworkSet.has(d)) {
        reworkSet.set(d, null)
        queue.push(d)
      }
    }
  }
  const downstreamOnly = [...reworkSet].filter(([, v]) => !v).map(([r]) => LABEL[r])
  log(`재작업: ${flagged.map((v) => LABEL[v.role]).join(', ')} / 하류 확인: ${downstreamOnly.join(', ') || '없음'}`)

  for (const role of FLOW_ORDER) {
    if (!reworkSet.has(role)) continue
    const v = reworkSet.get(role)
    const ups = (upstreamOf.get(role) || []).map((r) => LABEL[r]).join(', ')
    const upNote = ups ? `선행 역할(${ups})도 이번에 다시 작업했다. 바뀐 입력을 먼저 확인하라.` : ''
    const task = v
      ? [
          `PD 검수(${repoPath(review.reviewFile)})에서 재작업 판정을 받았다.`,
          `근거:\n${bullet(v.reasons)}`,
          `재작업 지시:\n   ${instructionText(v)}`,
          upNote,
        ]
          .filter(Boolean)
          .join('\n')
      : `선행 역할(${ups})이 다시 작업해 네 입력 산출물이 바뀌었을 수 있다. 바뀐 입력을 확인해 네 산출물에 반영하라. 반영할 것이 없으면 요약에 "변경 없음"이라고 적어라.`
    const coreOnly = role === 'coder' && !coderHas('통합')
    const report = await tryRunRole(
      role,
      v ? '재작업' : '하류 반영 확인',
      'PD 검수',
      coreOnly ? `${task}\n화면(src/ui)은 바꾸지 않는다 — 이번 요청의 코더 지시는 코어 로직+로더 단계뿐이다.` : task,
      coreOnly ? { stage: '코어 로직+로더' } : {},
    )
    if (stopped()) return finish(STOP_FOR_USER, review)
    await afterRun(role, report, 'PD 검수')
    if (stopped()) return finish(STOP_FOR_USER, review)
  }
  await runFollowUps('PD 검수', FLOW_ORDER)
  if (stopped()) return finish(STOP_FOR_USER, review)

  const first = review
  try {
    review = await pdReview(2, first)
  } catch (err) {
    return finish(`재작업 후 재검수 실패 (${err.message}) — 1차 검수 결과 첨부`, first)
  }
  if (stopped()) return finish(STOP_FOR_USER, review)
  const left = review.verdicts.filter((v) => v.result === '재작업')
  return finish(
    left.length ? `재검수 후에도 재작업 남음: ${left.map((v) => LABEL[v.role]).join(', ')}` : '완료 — 재작업 후 PD 검수 통과',
    review,
  )
} catch (err) {
  return finish(`중단: ${err.message}`, review)
}
