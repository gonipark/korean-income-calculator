// 기준중위소득 데이터 (보건복지부 중앙생활보장위원회 고시)
// data.py 그대로 포팅

const MEDIAN_INCOME = {
  2024: {
    1: 2_228_445,
    2: 3_682_609,
    3: 4_714_657,
    4: 5_729_913,
    5: 6_695_735,
    6: 7_618_369,
    7: 8_514_994,
  },
  2025: {
    1: 2_392_013,
    2: 3_932_658,
    3: 5_025_353,
    4: 6_097_773,
    5: 7_108_192,
    6: 8_064_805,
    7: 8_988_428,
  },
};

const EXTRA_PER_PERSON = {
  2024: 896_625,
  2025: 923_623,
};

function getMedianIncome(year, householdSize) {
  const table = MEDIAN_INCOME[year];
  if (householdSize <= 7) return table[householdSize];
  const extra = EXTRA_PER_PERSON[year] * (householdSize - 7);
  return table[7] + extra;
}

const PROGRAMS_BY_PERCENT = {
  32: [["생계급여", "기초생활보장 생계급여 선정 기준 (2024년부터 32%)"]],
  40: [["의료급여", "기초생활보장 의료급여 선정 기준"]],
  48: [["주거급여", "기초생활보장 주거급여 선정 기준 (2024년부터 48%)"]],
  50: [
    ["교육급여", "기초생활보장 교육급여 선정 기준"],
    ["차상위계층", "차상위 본인부담경감, 자활급여 등"],
  ],
  63: [["한부모가족 지원", "저소득 한부모가족 복지급여 (중위 63% 이하)"]],
  70: [["긴급복지지원", "주소득자 사망·실직 등 위기가구 (중위 75% 이하 + 재산기준)"]],
  100: [
    ["신혼부부 특별공급 (우선공급)", "공공분양 신혼특공 우선공급 (외벌이 100%, 맞벌이 120%)"],
    ["디딤돌·버팀목 대출 (일부 우대)", "주택도시기금 우대 금리 적용 구간"],
    ["청년월세 한시 특별지원", "청년 본인 중위 60% & 부모포함 100% 이하"],
  ],
  120: [
    ["신혼부부 특별공급 (일반공급)", "공공분양 외벌이 120%, 맞벌이 140%"],
    ["생애최초 특별공급", "공공분양 생애최초"],
    ["신생아 특례 디딤돌 대출", "신생아 가구 주택구입자금 (소득 1.3억 이하 별도)"],
  ],
  130: [["신혼부부 특별공급 맞벌이", "맞벌이 신혼특공 일반공급"]],
  140: [["신혼부부 특별공급 맞벌이 우선", "맞벌이 우선공급 한도"]],
  150: [
    ["청년 매입임대주택", "LH 청년 매입임대 1순위 (본인+부모 중위 100% / 1인 120%)"],
    ["행복주택 (청년·신혼)", "청년·신혼부부·한부모 행복주택"],
  ],
  160: [["신혼부부 매입임대 II (맞벌이)", "맞벌이 신혼부부 매입임대 II"]],
  180: [
    ["청년 우대형 청약통장", "만 19~34세 무주택 청년 우대 (연소득 3,600만원 이하 별도)"],
    ["청년도약계좌", "총급여 7,500만원 이하 + 가구 중위 250% 이하 (참고)"],
  ],
  200: [
    ["민영주택 신혼부부 특별공급", "민영 신혼특공 (맞벌이 200%)"],
    ["청년 주택드림 청약통장", "만 19~34세, 연소득 5,000만원 이하"],
  ],
};

function findApplicablePrograms(percent) {
  const result = [];
  const thresholds = Object.keys(PROGRAMS_BY_PERCENT).map(Number).sort((a, b) => a - b);
  for (const t of thresholds) {
    if (percent <= t) {
      for (const [name, desc] of PROGRAMS_BY_PERCENT[t]) {
        result.push({ threshold: t, name, desc });
      }
    }
  }
  return result;
}

const COMMON_PERCENTS = [32, 40, 48, 50, 63, 70, 100, 120, 130, 140, 150, 160, 180, 200];

// expose to globals for non-module loading
if (typeof window !== "undefined") {
  Object.assign(window, {
    MEDIAN_INCOME,
    EXTRA_PER_PERSON,
    getMedianIncome,
    PROGRAMS_BY_PERCENT,
    findApplicablePrograms,
    COMMON_PERCENTS,
  });
}
