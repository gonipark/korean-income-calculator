// 6개 제도 자격 자동 판정 (eligibility.py 포팅)
// data.js의 getMedianIncome가 globals에 노출되어 있음

function statusFromPct(myPct, thresholdPct) {
  if (myPct <= thresholdPct) return ["eligible", "✅ 소득 기준 충족"];
  if (myPct <= thresholdPct + 5) return ["conditional", "⚠️ 경계선 (재계산 권장)"];
  return ["ineligible", "❌ 소득 초과"];
}

function householdSizeBasic(p) {
  let size = 1;
  if (p.isMarried && p.spouseLivingTogether) size += 1;
  size += p.numChildren;
  if (p.parentsLivingTogether) size += 2;
  size += p.siblingsLivingTogether;
  return size;
}

function householdIncomeBasic(p) {
  let income = p.monthlyIncome;
  if (p.isMarried && p.spouseLivingTogether) income += p.spouseMonthlyIncome;
  if (p.parentsLivingTogether) income += p.parentsMonthlyIncome;
  return income;
}

function check생계급여(p) {
  const size = householdSizeBasic(p);
  const income = householdIncomeBasic(p);
  const median = getMedianIncome(p.year, size);
  const thr = 32;
  const myPct = (income / median) * 100;
  const [status, label] = statusFromPct(myPct, thr);
  return {
    programId: "생계급여",
    programName: "생계급여 (기초생활보장)",
    category: "기초생활보장",
    status, statusLabel: label,
    householdSize: size, combinedIncome: income,
    thresholdPct: thr, thresholdAmount: Math.floor(median * thr / 100),
    myPercent: myPct,
    reasoning: `동일세대 ${size}인 기준, 가구 월소득 ${income.toLocaleString()}원 = 중위 ${myPct.toFixed(1)}%`,
    notes: [
      "재산 기준(자동차·금융자산·부동산) 별도 적용",
      "근로·사업소득 30% 공제 등 소득인정액 산정 별도",
      "2025년부터 부양의무자 기준 폐지",
    ],
  };
}

function check주거급여(p) {
  const size = householdSizeBasic(p);
  const income = householdIncomeBasic(p);
  const median = getMedianIncome(p.year, size);
  const thr = 48;
  const myPct = (income / median) * 100;
  const [status, label] = statusFromPct(myPct, thr);
  return {
    programId: "주거급여",
    programName: "주거급여 (기초생활보장)",
    category: "기초생활보장",
    status, statusLabel: label,
    householdSize: size, combinedIncome: income,
    thresholdPct: thr, thresholdAmount: Math.floor(median * thr / 100),
    myPercent: myPct,
    reasoning: `동일세대 ${size}인 기준, 가구 월소득 ${income.toLocaleString()}원 = 중위 ${myPct.toFixed(1)}%`,
    notes: ["임차가구는 임차급여, 자가가구는 수선유지급여", "지역별 기준임대료 한도 별도"],
  };
}

function check청년월세(p) {
  if (!(p.age >= 19 && p.age <= 34)) {
    return {
      programId: "청년월세", programName: "청년월세 한시 특별지원",
      category: "주거지원", status: "ineligible", statusLabel: "❌ 연령 미충족",
      householdSize: 0, combinedIncome: 0, thresholdPct: 60, thresholdAmount: 0, myPercent: 0,
      reasoning: `만 ${p.age}세 — 만 19~34세 청년만 대상`, notes: [],
    };
  }
  if (p.isHomeowner) {
    return {
      programId: "청년월세", programName: "청년월세 한시 특별지원",
      category: "주거지원", status: "ineligible", statusLabel: "❌ 무주택 요건 미충족",
      householdSize: 0, combinedIncome: 0, thresholdPct: 60, thresholdAmount: 0, myPercent: 0,
      reasoning: "유주택자는 신청 불가", notes: [],
    };
  }
  const selfSize = 1 + (p.isMarried && p.spouseLivingTogether ? 1 : 0);
  const selfIncome = p.monthlyIncome + (p.isMarried && p.spouseLivingTogether ? p.spouseMonthlyIncome : 0);
  const selfMedian = getMedianIncome(p.year, selfSize);
  const selfPct = (selfIncome / selfMedian) * 100;

  const skipOrigin = p.age >= 30 || p.isMarried;
  let originPct = null;
  const notes = [
    "보증금 1.5억·월세 70만원 이하 주택 거주 (월세 60 초과시 보증금 환산 합산)",
    "월 최대 20만원 × 12개월 (총 240만원) 지원",
  ];
  if (skipOrigin) {
    notes.push(`만 ${p.age}세 / 결혼=${p.isMarried} → 원가구 소득기준 미적용 케이스 가능`);
  } else {
    const originSize = 3;
    const originIncome = p.monthlyIncome + p.parentsMonthlyIncome;
    const originMedian = getMedianIncome(p.year, originSize);
    originPct = (originIncome / originMedian) * 100;
    notes.unshift(`원가구(본인+부모 ${originSize}인): ${originIncome.toLocaleString()}원 = 중위 ${originPct.toFixed(1)}% (한도 100%)`);
  }
  const selfOk = selfPct <= 60;
  const originOk = originPct === null || originPct <= 100;
  let status, label;
  if (selfOk && originOk) [status, label] = ["eligible", "✅ 소득 기준 충족"];
  else if (selfPct > 60) [status, label] = ["ineligible", `❌ 본인가구 소득 초과 (중위 ${selfPct.toFixed(1)}%)`];
  else [status, label] = ["ineligible", `❌ 원가구 소득 초과 (중위 ${(originPct ?? 0).toFixed(1)}%)`];

  return {
    programId: "청년월세", programName: "청년월세 한시 특별지원",
    category: "주거지원", status, statusLabel: label,
    householdSize: selfSize, combinedIncome: selfIncome,
    thresholdPct: 60, thresholdAmount: Math.floor(selfMedian * 0.6),
    myPercent: selfPct,
    reasoning: `본인가구 ${selfSize}인: ${selfIncome.toLocaleString()}원 = 중위 ${selfPct.toFixed(1)}% (한도 60%)`,
    notes,
  };
}

function check신혼특공(p) {
  if (!p.isMarried) {
    return {
      programId: "신혼특공", programName: "신혼부부 특별공급 (공공분양)",
      category: "청약", status: "ineligible", statusLabel: "❌ 혼인 요건 미충족",
      householdSize: 0, combinedIncome: 0, thresholdPct: 120, thresholdAmount: 0, myPercent: 0,
      reasoning: "혼인신고한 부부 또는 예비신혼부부만 대상",
      notes: ["예비신혼부부(입주 전 혼인 예정)도 신청 가능"],
    };
  }
  if (p.isHomeowner) {
    return {
      programId: "신혼특공", programName: "신혼부부 특별공급 (공공분양)",
      category: "청약", status: "ineligible", statusLabel: "❌ 무주택 세대구성원 요건 미충족",
      householdSize: 0, combinedIncome: 0, thresholdPct: 120, thresholdAmount: 0, myPercent: 0,
      reasoning: "세대 구성원 전원 무주택 필요", notes: [],
    };
  }
  const isDual = p.spouseMonthlyIncome > 0;
  const size = 2 + p.numChildren;
  const income = p.monthlyIncome + p.spouseMonthlyIncome;
  const median = getMedianIncome(p.year, size);
  const myPct = (income / median) * 100;
  const thr = isDual ? 120 : 100;
  const [status, label] = statusFromPct(myPct, thr);
  const notes = [
    "혼인신고 7년 이내 + 무주택 세대구성원 전원 + 청약통장 가입 6개월·6회 납입",
    `${isDual ? "맞벌이" : "외벌이"} 기준 우선공급 한도 ${thr}% 적용`,
    "일반공급(외벌이 130/맞벌이 140%) 및 추첨제(180/200%) 별도 존재",
    "자산 기준(부동산 + 자동차) 별도 적용",
  ];
  if (p.hasNewborn) notes.push("🍼 신생아 특별공급(별도): 2세 이하 자녀 있으면 우선 배정");
  return {
    programId: "신혼특공",
    programName: "신혼부부 특별공급 (공공분양 우선공급)",
    category: "청약", status, statusLabel: label,
    householdSize: size, combinedIncome: income,
    thresholdPct: thr, thresholdAmount: Math.floor(median * thr / 100),
    myPercent: myPct,
    reasoning: `부부+자녀 ${size}인, 부부합산 ${income.toLocaleString()}원 = 중위 ${myPct.toFixed(1)}%`,
    notes,
  };
}

function check청년매입임대(p) {
  if (!(p.age >= 19 && p.age <= 39)) {
    return {
      programId: "청년매입임대", programName: "청년 매입임대주택 (LH)",
      category: "주거지원", status: "ineligible", statusLabel: "❌ 연령 미충족",
      householdSize: 1, combinedIncome: p.monthlyIncome,
      thresholdPct: 100, thresholdAmount: 0, myPercent: 0,
      reasoning: `만 ${p.age}세 — 만 19~39세 미혼만 대상`, notes: [],
    };
  }
  if (p.isMarried) {
    return {
      programId: "청년매입임대", programName: "청년 매입임대주택 (LH)",
      category: "주거지원", status: "ineligible", statusLabel: "❌ 혼인 — 청년 매입임대 대상 아님",
      householdSize: 1, combinedIncome: p.monthlyIncome,
      thresholdPct: 100, thresholdAmount: 0, myPercent: 0,
      reasoning: "미혼 청년만 대상 (신혼부부 매입임대는 별도)",
      notes: ["기혼이라면 신혼부부 매입임대 II/III 확인"],
    };
  }
  if (p.isHomeowner) {
    return {
      programId: "청년매입임대", programName: "청년 매입임대주택 (LH)",
      category: "주거지원", status: "ineligible", statusLabel: "❌ 무주택 요건 미충족",
      householdSize: 1, combinedIncome: p.monthlyIncome,
      thresholdPct: 100, thresholdAmount: 0, myPercent: 0,
      reasoning: "무주택자만 신청 가능", notes: [],
    };
  }
  const rank2Size = 3;
  const rank2Income = p.monthlyIncome + p.parentsMonthlyIncome;
  const rank2Median = getMedianIncome(p.year, rank2Size);
  const rank2Pct = (rank2Income / rank2Median) * 100;
  const rank3Pct = (p.monthlyIncome / getMedianIncome(p.year, 1)) * 100;

  let rank, status, label, size, income, myPct, thr;
  if (rank2Pct <= 100) {
    rank = "2순위 (본인+부모 100% 이하)";
    [status, label] = ["eligible", `✅ 2순위 자격 (원가구 중위 ${rank2Pct.toFixed(1)}%)`];
    [size, income, myPct, thr] = [rank2Size, rank2Income, rank2Pct, 100];
  } else if (rank3Pct <= 120) {
    rank = "3순위 (본인 100%/120% 이하)";
    [status, label] = ["eligible", `✅ 3순위 자격 (본인 중위 ${rank3Pct.toFixed(1)}%)`];
    [size, income, myPct, thr] = [1, p.monthlyIncome, rank3Pct, 120];
  } else {
    rank = "순위 외";
    [status, label] = ["ineligible", "❌ 소득 초과"];
    [size, income, myPct, thr] = [1, p.monthlyIncome, rank3Pct, 120];
  }
  return {
    programId: "청년매입임대",
    programName: `청년 매입임대주택 (LH) — ${rank}`,
    category: "주거지원", status, statusLabel: label,
    householdSize: size, combinedIncome: income,
    thresholdPct: thr,
    thresholdAmount: Math.floor(getMedianIncome(p.year, size) * thr / 100),
    myPercent: myPct,
    reasoning: `2순위 검사: 본인+부모 ${rank2Pct.toFixed(1)}% / 3순위 검사: 본인 ${rank3Pct.toFixed(1)}%`,
    notes: [
      "1순위(생계/의료/주거급여 수급자, 차상위, 한부모, 보호종료 아동) 별도 우대",
      "자산 기준(총자산·자동차) 별도 적용",
      "지역·평형별 임대료 상이",
    ],
  };
}

function check디딤돌(p) {
  if (!p.isHouseholdHead) {
    return {
      programId: "디딤돌", programName: "디딤돌 대출 (주택구입자금)",
      category: "대출", status: "conditional", statusLabel: "⚠️ 세대주 요건 확인 필요",
      householdSize: 0, combinedIncome: 0, thresholdPct: 0, thresholdAmount: 0, myPercent: 0,
      reasoning: "대출 실행 시점 무주택 세대주 필요",
      notes: ["대출 실행 전 세대 분리 가능"],
    };
  }
  const annualIncome = (p.monthlyIncome + (p.isMarried ? p.spouseMonthlyIncome : 0)) * 12;
  let annualLimit, caseLabel;
  if (p.hasNewborn) { annualLimit = 130_000_000; caseLabel = "신생아 특례 (2세 이하 자녀)"; }
  else if (p.isMarried || p.numChildren >= 2) { annualLimit = 85_000_000; caseLabel = "신혼부부 또는 2자녀 이상"; }
  else { annualLimit = 60_000_000; caseLabel = "일반 (생애최초는 7,000만원)"; }
  const ok = annualIncome <= annualLimit;
  return {
    programId: "디딤돌", programName: "디딤돌 대출 (주택구입자금)",
    category: "대출",
    status: ok ? "eligible" : "ineligible",
    statusLabel: ok ? "✅ 소득 기준 충족" : "❌ 연소득 초과",
    householdSize: p.isMarried ? 2 : 1,
    combinedIncome: Math.floor(annualIncome / 12),
    thresholdPct: 0, thresholdAmount: Math.floor(annualLimit / 12),
    myPercent: 0,
    reasoning: `${caseLabel} — 연소득 ${annualIncome.toLocaleString()}원 (한도 ${annualLimit.toLocaleString()}원)`,
    notes: [
      "총자산 4.69억원 이하 (2024년 기준)",
      "주택가격 5억(신혼·2자녀 6억) 이하",
      "전용 85㎡ 이하 (수도권 외 100㎡)",
    ],
  };
}

const ALL_CHECKS = [check생계급여, check주거급여, check청년월세, check신혼특공, check청년매입임대, check디딤돌];

function evaluateAll(profile) {
  const results = ALL_CHECKS.map(fn => fn(profile));
  const order = { eligible: 0, conditional: 1, ineligible: 2 };
  results.sort((a, b) => order[a.status] - order[b.status] || a.category.localeCompare(b.category));
  return results;
}

if (typeof window !== "undefined") {
  Object.assign(window, { evaluateAll });
}
