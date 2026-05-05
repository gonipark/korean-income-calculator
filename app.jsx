// Main app: 중위소득 계산기 (Toss/Wise 톤)
const { useState, useMemo, useEffect, useRef } = React;

// ─────────────────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
const fmtMan = (n) => {
  // 304만 원 형식
  if (n >= 100_000_000) {
    const eok = Math.floor(n / 100_000_000);
    const man = Math.floor((n % 100_000_000) / 10_000);
    return man > 0 ? `${eok}억 ${man}만` : `${eok}억`;
  }
  if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
};

const STATUS_META = {
  eligible: { label: "자격 가능", dot: "var(--ok)", bg: "var(--ok-bg)", chip: "var(--ok-chip)" },
  conditional: { label: "추가 확인", dot: "var(--warn)", bg: "var(--warn-bg)", chip: "var(--warn-chip)" },
  ineligible: { label: "자격 없음", dot: "var(--ink-30)", bg: "var(--surface-2)", chip: "var(--ink-50)" },
};

// ─────────────────────────────────────────────────────────
// Tiny components
// ─────────────────────────────────────────────────────────
function Field({ label, hint, children, suffix }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <span className="field-input-wrap">
        {children}
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function NumberInput({ value, onChange, min = 0, max = 1e12, step = 1, suffix, placeholder }) {
  return (
    <span className="num-input">
      <input
        type="text"
        inputMode="numeric"
        value={value === 0 ? "" : value.toLocaleString("ko-KR")}
        placeholder={placeholder ?? "0"}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, "");
          const n = raw === "" ? 0 : Math.min(max, Math.max(min, parseInt(raw, 10)));
          onChange(n);
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </span>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button type="button" className={`pill ${active ? "is-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={`seg-opt ${value === opt.value ? "is-active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" className={`toggle ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span className="toggle-label">{label}</span>
    </button>
  );
}

function Stepper({ value, onChange, min = 0, max = 15 }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="감소">−</button>
      <span className="stepper-val">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="증가">+</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Mode: 내 위치 (소득 → %)
// ─────────────────────────────────────────────────────────
function PositionMode({ year, householdSize, baseIncome }) {
  const [mode, setMode] = useState("월");
  const [income, setIncome] = useState(3_000_000);
  const monthly = mode === "월" ? income : Math.floor(income / 12);
  const pct = baseIncome ? (monthly / baseIncome) * 100 : 0;
  const applicable = useMemo(() => findApplicablePrograms(pct), [pct]);

  // group by threshold
  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of applicable) {
      if (!map.has(p.threshold)) map.set(p.threshold, []);
      map.get(p.threshold).push(p);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [applicable]);

  // gauge: 0% ~ 250%
  const GAUGE_MAX = 250;
  const gaugeX = Math.min(pct, GAUGE_MAX) / GAUGE_MAX;

  return (
    <div className="mode-pane">
      <div className="hero">
        <div className="hero-label">내 소득은 중위소득의</div>
        <div className="hero-value">
          <span className="hero-num" style={{ ["--seg"]: gaugeX }}>{pct.toFixed(1)}</span>
          <span className="hero-pct">%</span>
        </div>
        <div className="hero-sub">
          {householdSize}인 가구 100% 기준 {fmt(baseIncome)}원 / 월 · {year}년
        </div>

        <div className="gauge">
          <div className="gauge-track">
            {[32, 50, 100, 150, 200].map((m) => (
              <span key={m} className="gauge-tick" style={{ left: `${(m / GAUGE_MAX) * 100}%` }}>
                <span className="gauge-tick-label">{m}%</span>
              </span>
            ))}
            <div className="gauge-fill" style={{ width: `${gaugeX * 100}%` }} />
            <div className="gauge-marker" style={{ left: `${gaugeX * 100}%` }}>
              <span className="gauge-marker-dot" />
            </div>
          </div>
        </div>
      </div>

      <div className="card input-card">
        <div className="card-head">
          <div>
            <div className="eyebrow">소득 입력</div>
            <h3>월 또는 연 소득</h3>
          </div>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "월", label: "월소득" },
              { value: "연", label: "연소득" },
            ]}
          />
        </div>
        <div className="big-input">
          <NumberInput
            value={income}
            onChange={setIncome}
            max={10_000_000_000}
            suffix="원"
          />
        </div>
        <div className="big-input-meta">
          <span>월 환산 <b>{fmt(monthly)}</b>원</span>
          <span>연 환산 <b>{fmt(monthly * 12)}</b>원</span>
        </div>
      </div>

      <div className="section-head">
        <h3>해당 가능성 있는 제도</h3>
        <p className="muted">소득 기준만 비교한 결과예요. 자산·연령·무주택 여부 등 추가 조건은 공식 안내를 확인하세요.</p>
      </div>

      {grouped.length === 0 && (
        <div className="empty-card">
          입력하신 소득은 등록된 제도들의 일반 소득 상한선을 넘습니다.
          <span className="muted">고소득자 대상 제도(예: 일부 민영 청약)는 별도 확인.</span>
        </div>
      )}

      <div className="program-groups">
        {grouped.map(([thr, list]) => (
          <div className="program-group" key={thr}>
            <div className="thr-tag">중위 {thr}% 이하</div>
            <div className="program-list">
              {list.map((p, i) => (
                <div className="program-row" key={i}>
                  <div className="program-name">{p.name}</div>
                  <div className="program-desc">{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Mode: 비율별 금액 조회 + 슬라이더
// ─────────────────────────────────────────────────────────
function PercentMode({ year, householdSize, baseIncome }) {
  const [pct, setPct] = useState(100);
  const customAmount = Math.floor(baseIncome * pct / 100);

  return (
    <div className="mode-pane">
      <div className="card slider-card">
        <div className="eyebrow">직접 비율 입력</div>
        <div className="slider-row">
          <input
            type="range" min="10" max="300" step="5"
            value={pct} onChange={(e) => setPct(parseInt(e.target.value, 10))}
            className="range"
            style={{ "--pct": `${((pct - 10) / 290) * 100}%` }}
          />
          <div className="slider-readout">
            <div className="slider-pct">{pct}<span>%</span></div>
            <div className="slider-amounts">
              <div><span className="muted">월</span> <b>{fmt(customAmount)}</b>원</div>
              <div><span className="muted">연</span> <b>{fmt(customAmount * 12)}</b>원</div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-head">
        <h3>{year}년 · {householdSize}인 가구 · 비율별 금액</h3>
        <p className="muted">청약·복지 제도에서 자주 쓰이는 기준입니다.</p>
      </div>

      <div className="table-wrap">
        <table className="ratio-table">
          <thead>
            <tr>
              <th>비율</th>
              <th>월 소득</th>
              <th>연 소득</th>
              <th>주요 제도</th>
            </tr>
          </thead>
          <tbody>
            {COMMON_PERCENTS.map((p) => {
              const amt = Math.floor(baseIncome * p / 100);
              const programs = PROGRAMS_BY_PERCENT[p] || [];
              const isCurrent = p === pct;
              return (
                <tr key={p} className={isCurrent ? "is-current" : ""}>
                  <td><span className="pct-badge">{p}%</span></td>
                  <td className="num">{fmt(amt)}원</td>
                  <td className="num muted">{fmt(amt * 12)}원</td>
                  <td className="programs-cell">
                    {programs.length === 0 ? <span className="muted">—</span> :
                      programs.map(([n], i) => <span key={i} className="prog-chip">{n}</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Mode: 가구원 수 전체표
// ─────────────────────────────────────────────────────────
function MatrixMode({ year }) {
  const sizes = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="mode-pane">
      <div className="section-head">
        <h3>{year}년 · 가구원 수 × 비율 전체표</h3>
        <p className="muted">한눈에 비교하는 월 소득 매트릭스 (단위: 원)</p>
      </div>

      <div className="table-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="sticky-col">비율</th>
              {sizes.map(s => <th key={s}>{s}인</th>)}
            </tr>
          </thead>
          <tbody>
            {COMMON_PERCENTS.map(p => (
              <tr key={p}>
                <td className="sticky-col"><span className="pct-badge">{p}%</span></td>
                {sizes.map(s => {
                  const base = getMedianIncome(year, s);
                  const amt = Math.floor(base * p / 100);
                  return <td key={s} className="num">{fmt(amt)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-head">
        <h3>주요 제도별 소득 기준</h3>
      </div>

      <div className="program-groups">
        {Object.keys(PROGRAMS_BY_PERCENT).map(Number).sort((a, b) => a - b).map(thr => (
          <div className="program-group" key={thr}>
            <div className="thr-tag">중위 {thr}% 이하</div>
            <div className="program-list">
              {PROGRAMS_BY_PERCENT[thr].map(([n, d], i) => (
                <div className="program-row" key={i}>
                  <div className="program-name">{n}</div>
                  <div className="program-desc">{d}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Mode: 11문항 위저드 (섹션 카드 5개)
// ─────────────────────────────────────────────────────────
function WizardMode({ year }) {
  const [step, setStep] = useState(0); // 0~4 = 입력 5단계, 5 = 결과
  const [w, setW] = useState({
    age: 30,
    isHomeowner: false,
    isHouseholdHead: true,
    monthlyIncome: 3_000_000,
    isMarried: false,
    spouseLivingTogether: true,
    spouseMonthlyIncome: 0,
    numChildren: 0,
    hasNewborn: false,
    parentsLivingTogether: false,
    parentsMonthlyIncome: 0,
    siblingsLivingTogether: 0,
    realEstateValue: 0,
    financialAssets: 0,
  });
  const set = (patch) => setW({ ...w, ...patch });

  const STEPS = [
    { key: "self", title: "본인 정보", desc: "나이·소득·주택 보유" },
    { key: "spouse", title: "배우자", desc: "결혼·배우자 소득" },
    { key: "children", title: "자녀", desc: "자녀 수·신생아" },
    { key: "family", title: "부모·형제", desc: "동거 가족" },
    { key: "assets", title: "자산", desc: "부동산·금융자산" },
  ];

  const results = useMemo(() => {
    if (step !== 5) return null;
    return evaluateAll({ ...w, year });
  }, [step, w, year]);

  function next() { setStep(Math.min(STEPS.length, step + 1)); }
  function prev() { setStep(Math.max(0, step - 1)); }
  function reset() { setStep(0); }

  if (step === 5 && results) {
    return <WizardResults results={results} profile={w} year={year} onReset={reset} />;
  }

  return (
    <div className="mode-pane wizard">
      <div className="wiz-progress">
        <div className="wiz-steps">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`wiz-step ${i === step ? "is-active" : ""} ${i < step ? "is-done" : ""}`}
              onClick={() => setStep(i)}
            >
              <span className="wiz-step-num">{i < step ? "✓" : i + 1}</span>
              <span className="wiz-step-title">{s.title}</span>
            </button>
          ))}
        </div>
        <div className="wiz-progress-bar">
          <div className="wiz-progress-fill" style={{ width: `${(step / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="card wiz-card">
        <div className="eyebrow">STEP {step + 1} / {STEPS.length}</div>
        <h2 className="wiz-title">{STEPS[step].title}</h2>
        <p className="wiz-desc muted">{STEPS[step].desc}</p>

        <div className="wiz-body">
          {step === 0 && (
            <div className="grid-2">
              <Field label="만 나이">
                <NumberInput value={w.age} onChange={(v) => set({ age: v })} max={120} suffix="세" />
              </Field>
              <Field label="본인 월소득">
                <NumberInput value={w.monthlyIncome} onChange={(v) => set({ monthlyIncome: v })} max={1e10} suffix="원" />
              </Field>
              <Field label="주택 소유 여부">
                <Segmented
                  value={w.isHomeowner ? "유주택" : "무주택"}
                  onChange={(v) => set({ isHomeowner: v === "유주택" })}
                  options={[{ value: "무주택", label: "무주택" }, { value: "유주택", label: "유주택" }]}
                />
              </Field>
              <Field label="주민등록 세대주">
                <Segmented
                  value={w.isHouseholdHead ? "세대주" : "세대원"}
                  onChange={(v) => set({ isHouseholdHead: v === "세대주" })}
                  options={[{ value: "세대주", label: "세대주" }, { value: "세대원", label: "세대원" }]}
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid-2">
              <Field label="결혼 여부">
                <Segmented
                  value={w.isMarried ? "기혼" : "미혼"}
                  onChange={(v) => set({ isMarried: v === "기혼" })}
                  options={[{ value: "미혼", label: "미혼" }, { value: "기혼", label: "기혼" }]}
                />
              </Field>
              {w.isMarried && (
                <>
                  <Field label="배우자와 동거">
                    <Toggle checked={w.spouseLivingTogether} onChange={(v) => set({ spouseLivingTogether: v })} label={w.spouseLivingTogether ? "동거 중" : "별거"} />
                  </Field>
                  <Field label="배우자 월소득" hint="외벌이면 0">
                    <NumberInput value={w.spouseMonthlyIncome} onChange={(v) => set({ spouseMonthlyIncome: v })} max={1e10} suffix="원" />
                  </Field>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid-2">
              <Field label="자녀 수" hint="만 30세 미만 미혼">
                <Stepper value={w.numChildren} onChange={(v) => set({ numChildren: v })} min={0} max={10} />
              </Field>
              <Field label="만 2세 미만 자녀">
                <Toggle checked={w.hasNewborn} onChange={(v) => set({ hasNewborn: v })} label={w.hasNewborn ? "있음 (신생아 특례 대상)" : "없음"} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="grid-2">
              <Field label="부모와 동거">
                <Toggle checked={w.parentsLivingTogether} onChange={(v) => set({ parentsLivingTogether: v })} label={w.parentsLivingTogether ? "동거 중" : "비동거"} />
              </Field>
              {w.parentsLivingTogether && (
                <Field label="동거 부모 월소득 합계">
                  <NumberInput value={w.parentsMonthlyIncome} onChange={(v) => set({ parentsMonthlyIncome: v })} max={1e10} suffix="원" />
                </Field>
              )}
              <Field label="동거 형제자매 수">
                <Stepper value={w.siblingsLivingTogether} onChange={(v) => set({ siblingsLivingTogether: v })} min={0} max={10} />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="grid-2">
              <Field label="보유 부동산 가액" hint="없으면 0">
                <NumberInput value={w.realEstateValue} onChange={(v) => set({ realEstateValue: v })} max={1e12} suffix="원" />
              </Field>
              <Field label="금융자산 합계">
                <NumberInput value={w.financialAssets} onChange={(v) => set({ financialAssets: v })} max={1e12} suffix="원" />
              </Field>
              <p className="muted small grid-span-2">
                자산은 참고용으로 표시되며, 실제 자격 판정은 제도별 자산 기준(자동차 포함)으로 별도 평가됩니다.
              </p>
            </div>
          )}
        </div>

        <div className="wiz-nav">
          <button type="button" className="btn-ghost" onClick={prev} disabled={step === 0}>이전</button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={next}>다음</button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setStep(5)}>진단 결과 보기 →</button>
          )}
        </div>
      </div>
    </div>
  );
}

function WizardResults({ results, profile, year, onReset }) {
  const groups = useMemo(() => ({
    eligible: results.filter(r => r.status === "eligible"),
    conditional: results.filter(r => r.status === "conditional"),
    ineligible: results.filter(r => r.status === "ineligible"),
  }), [results]);

  return (
    <div className="mode-pane wiz-results">
      <div className="result-hero">
        <div className="eyebrow">진단 결과</div>
        <h2 className="result-headline">
          {profile.age}세 {profile.isMarried ? "기혼" : "미혼"} ·{" "}
          {groups.eligible.length > 0 ? (
            <><span className="hl">{groups.eligible.length}개 제도</span>에 자격 가능</>
          ) : groups.conditional.length > 0 ? (
            <><span className="hl">{groups.conditional.length}개 제도</span>는 추가 확인 필요</>
          ) : (
            <>현재 입력으론 해당 제도가 없어요</>
          )}
        </h2>

        <div className="result-stats">
          <div className="rstat is-ok">
            <div className="rstat-num">{groups.eligible.length}</div>
            <div className="rstat-label">자격 가능</div>
          </div>
          <div className="rstat is-warn">
            <div className="rstat-num">{groups.conditional.length}</div>
            <div className="rstat-label">추가 확인</div>
          </div>
          <div className="rstat is-no">
            <div className="rstat-num">{groups.ineligible.length}</div>
            <div className="rstat-label">자격 없음</div>
          </div>
        </div>

        <button type="button" className="btn-ghost btn-reset" onClick={onReset}>← 처음으로 다시</button>
      </div>

      {groups.eligible.length > 0 && (
        <ResultGroup title="자격 가능한 제도" emoji="✅" items={groups.eligible} expanded />
      )}
      {groups.conditional.length > 0 && (
        <ResultGroup title="추가 확인 필요" emoji="⚠️" items={groups.conditional} />
      )}
      {groups.ineligible.length > 0 && (
        <ResultGroup title="자격 없음" emoji="○" items={groups.ineligible} compact />
      )}

      <div className="callout">
        <strong>참고용 결과예요.</strong> 실제 자격은 자산·연령·무주택 기간·청약통장·지역 등
        추가 조건이 적용되며, 매년 변경됩니다. 신청 전 보건복지부·LH·마이홈포털·HUG 등의
        공식 안내를 확인하세요.
      </div>
    </div>
  );
}

function ResultGroup({ title, emoji, items, expanded = false, compact = false }) {
  return (
    <div className="result-group">
      <div className="result-group-head">
        <span className="result-group-emoji">{emoji}</span>
        <h3>{title}</h3>
        <span className="result-group-count">{items.length}</span>
      </div>
      <div className={`result-cards ${compact ? "is-compact" : ""}`}>
        {items.map((r, i) => (
          <ResultCard key={i} r={r} expanded={expanded} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ r, expanded, compact }) {
  const [open, setOpen] = useState(expanded);
  const meta = STATUS_META[r.status];
  if (compact) {
    return (
      <div className="result-card is-compact">
        <span className="status-dot" style={{ background: meta.dot }} />
        <div className="rc-name">{r.programName}</div>
        <div className="rc-reason muted">{r.reasoning}</div>
      </div>
    );
  }
  return (
    <div className={`result-card status-${r.status}`}>
      <div className="rc-head">
        <div className="rc-meta">
          <span className="rc-cat">{r.category}</span>
          <span className="rc-status" style={{ color: meta.dot }}>{r.statusLabel}</span>
        </div>
        <h4 className="rc-name">{r.programName}</h4>
      </div>

      {r.thresholdAmount > 0 && (
        <div className="rc-stats">
          <div>
            <div className="rc-stats-label">적용 가구원</div>
            <div className="rc-stats-val">{r.householdSize}인</div>
          </div>
          <div>
            <div className="rc-stats-label">합산 월소득</div>
            <div className="rc-stats-val">{fmt(r.combinedIncome)}원</div>
          </div>
          <div>
            <div className="rc-stats-label">한도 (중위 {r.thresholdPct}%)</div>
            <div className="rc-stats-val">{fmt(r.thresholdAmount)}원</div>
          </div>
        </div>
      )}

      <div className="rc-reason">📐 {r.reasoning}</div>

      {r.notes.length > 0 && (
        <div className="rc-notes">
          <button type="button" className="rc-toggle" onClick={() => setOpen(!open)}>
            {open ? "추가 조건 접기 ▲" : `추가 조건 ${r.notes.length}개 보기 ▼`}
          </button>
          {open && (
            <ul>
              {r.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// App shell
// ─────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "indigo",
  "density": "comfortable",
  "showSidebar": true
}/*EDITMODE-END*/;

const ACCENTS = {
  indigo: { name: "Indigo", primary: "oklch(0.45 0.18 265)", primaryDeep: "oklch(0.32 0.16 265)", primarySoft: "oklch(0.96 0.03 265)" },
  navy: { name: "Deep Navy", primary: "oklch(0.32 0.13 255)", primaryDeep: "oklch(0.22 0.10 255)", primarySoft: "oklch(0.96 0.025 255)" },
  cobalt: { name: "Cobalt", primary: "oklch(0.50 0.20 250)", primaryDeep: "oklch(0.36 0.18 250)", primarySoft: "oklch(0.96 0.03 250)" },
  teal: { name: "Teal", primary: "oklch(0.48 0.13 195)", primaryDeep: "oklch(0.34 0.11 195)", primarySoft: "oklch(0.96 0.03 195)" },
};

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [year, setYear] = useState(2025);
  const [householdSize, setHouseholdSize] = useState(1);
  const [mode, setMode] = useState("position"); // position | percent | wizard | matrix

  const baseIncome = getMedianIncome(year, householdSize);
  const accent = ACCENTS[tweaks.accent] || ACCENTS.indigo;

  // CSS var injection
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand", accent.primary);
    root.style.setProperty("--brand-deep", accent.primaryDeep);
    root.style.setProperty("--brand-soft", accent.primarySoft);
    root.dataset.density = tweaks.density;
  }, [accent, tweaks.density]);

  const MODES = [
    { key: "position", label: "내 위치", desc: "소득 → 중위 %" },
    { key: "wizard", label: "상황 진단", desc: "11문항 자격 진단" },
    { key: "percent", label: "비율 조회", desc: "%별 금액" },
    { key: "matrix", label: "전체표", desc: "가구 × 비율" },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect x="2" y="2" width="28" height="28" rx="9" fill="var(--brand)" />
              <path d="M9 20 L14 12 L18 17 L23 10" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-title">중위소득</div>
            <div className="brand-sub">청약·복지 자격 한눈에</div>
          </div>
        </div>

        <div className="topbar-controls">
          <Segmented
            value={year}
            onChange={setYear}
            options={[{ value: 2025, label: "2025년" }, { value: 2024, label: "2024년" }]}
          />
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="card sidebar-card">
            <div className="eyebrow">기본 정보</div>
            <Field label="가구원 수" hint="본인 포함 같은 세대">
              <Stepper value={householdSize} onChange={setHouseholdSize} min={1} max={15} />
            </Field>
            <div className="sidebar-stat">
              <div className="ss-label">{householdSize}인 가구 100% (월)</div>
              <div className="ss-val">{fmt(baseIncome)}<span>원</span></div>
              <div className="ss-sub">연 환산 {fmt(baseIncome * 12)}원</div>
            </div>
          </div>

          <div className="caveat">
            데이터 출처: 보건복지부 중앙생활보장위원회 고시.
            정확한 자격 판단은 각 제도의 공식 안내를 확인하세요.
          </div>
        </aside>

        <main className="main">
          <nav className="mode-nav">
            {MODES.map(m => (
              <Pill key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>
                {m.label}
                <span className="pill-sub">{m.desc}</span>
              </Pill>
            ))}
          </nav>

          {mode === "position" && <PositionMode year={year} householdSize={householdSize} baseIncome={baseIncome} />}
          {mode === "percent" && <PercentMode year={year} householdSize={householdSize} baseIncome={baseIncome} />}
          {mode === "wizard" && <WizardMode year={year} />}
          {mode === "matrix" && <MatrixMode year={year} />}
        </main>
      </div>

      <TweaksPanel>
        <TweakSection title="외관">
          <TweakRadio
            label="액센트 컬러"
            value={tweaks.accent}
            onChange={(v) => setTweak("accent", v)}
            options={Object.entries(ACCENTS).map(([k, v]) => ({ value: k, label: v.name }))}
          />
          <TweakRadio
            label="밀도"
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "compact", label: "촘촘" },
              { value: "comfortable", label: "편안" },
              { value: "spacious", label: "넓게" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
