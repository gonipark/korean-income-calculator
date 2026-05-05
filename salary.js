// 실수령 ↔ 세전 환산 (근로소득자, 부양가족 1인 기준)
//
// 한계:
// - 부양가족 수 1인(본인) 기준 (가족 많으면 실수령 더 높음)
// - 비과세 식대 등 비과세 항목 미반영
// - 사업자/프리랜서(3.3% 원천징수)는 다름
// - 국민연금 상한(2024년 기준 월소득 617만원) 미반영
// → 일반 근로소득자 ±5% 정확도

// 4대보험 (근로자 부담분)
const NAT_PENSION = 0.045;     // 국민연금 4.5%
const HEALTH = 0.03545;        // 건강보험 3.545%
const LONG_CARE = 0.1295;      // 장기요양 = 건강보험료 × 12.95%
const EMP_INSURANCE = 0.009;   // 고용보험 0.9%

// 근로소득 간이세액표 발췌 (부양가족 1인, 자녀 0인 기준)
// [월급여(만원), 월 소득세(만원)]
// 출처: 국세청 근로소득간이세액표 (2024)
const INCOME_TAX_TABLE = [
  [100, 0],
  [150, 0],
  [200, 1.95],
  [250, 4.16],
  [300, 7.63],
  [350, 12.72],
  [400, 17.82],
  [450, 22.91],
  [500, 28.01],
  [550, 33.13],
  [600, 38.23],
  [700, 51.40],
  [800, 65.84],
  [900, 81.35],
  [1000, 96.85],
  [1200, 136.12],
  [1500, 197.52],
  [2000, 317.02],
  [3000, 556.02],
  [5000, 1156.02],
];

// 월 소득세 (원 단위) — 선형 보간
function monthlyIncomeTax(grossMonthly) {
  const salMan = grossMonthly / 10_000;
  if (salMan <= INCOME_TAX_TABLE[0][0]) return INCOME_TAX_TABLE[0][1] * 10_000;
  for (let i = 0; i < INCOME_TAX_TABLE.length - 1; i++) {
    const [s1, t1] = INCOME_TAX_TABLE[i];
    const [s2, t2] = INCOME_TAX_TABLE[i + 1];
    if (salMan <= s2) {
      const ratio = (salMan - s1) / (s2 - s1);
      return Math.round((t1 + (t2 - t1) * ratio) * 10_000);
    }
  }
  // 표 최상위 초과: 비례 외삽 (실효세율 유지)
  const [topSal, topTax] = INCOME_TAX_TABLE[INCOME_TAX_TABLE.length - 1];
  const effRate = topTax / topSal;
  return Math.round(salMan * effRate * 10_000);
}

// 4대보험 합계 (월, 원 단위)
function monthlyInsurance(grossMonthly) {
  const pension = grossMonthly * NAT_PENSION;
  const health = grossMonthly * HEALTH;
  const longCare = health * LONG_CARE;
  const emp = grossMonthly * EMP_INSURANCE;
  return Math.round(pension + health + longCare + emp);
}

// 세전 → 실수령
function grossToTakeHome(grossMonthly) {
  if (grossMonthly <= 0) return 0;
  const insurance = monthlyInsurance(grossMonthly);
  const incTax = monthlyIncomeTax(grossMonthly);
  const localTax = Math.round(incTax * 0.1);
  return grossMonthly - insurance - incTax - localTax;
}

// 실수령 → 세전 (binary search)
function takeHomeToGross(takeHome) {
  if (takeHome <= 0) return 0;
  let lo = takeHome;
  let hi = takeHome * 1.6 + 100_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const th = grossToTakeHome(mid);
    if (th < takeHome) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

if (typeof window !== "undefined") {
  Object.assign(window, {
    grossToTakeHome,
    takeHomeToGross,
    monthlyIncomeTax,
    monthlyInsurance,
  });
}
