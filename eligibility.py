"""
사용자 상황(UserProfile) 기반 제도별 자격 자동 판정.

각 제도의 가구원 수 산정 / 소득 합산 / 추가 자격(나이·무주택 등) 룰을
함수로 분리해 명시적으로 처리한다.

⚠️ 주의: 청약·복지 제도의 세부 룰은 매년 바뀌며 예외 조항이 많다.
        본 모듈의 판정은 '소득 기준 1차 스크리닝'용이며 실제 자격 판정은
        각 제도 공식 안내 또는 마이홈포털·LH·복지로를 통해 확인해야 한다.
"""
from dataclasses import dataclass, field
from typing import Callable, List, Literal

from data import get_median_income


# ─────────────────────────────────────────────────────────
# 사용자 입력 모델
# ─────────────────────────────────────────────────────────
@dataclass
class UserProfile:
    year: int
    # 본인
    age: int
    is_homeowner: bool          # 본인 소유 주택 보유?
    is_household_head: bool     # 주민등록상 세대주?
    monthly_income: int         # 본인 월소득
    # 배우자
    is_married: bool
    spouse_living_together: bool = False
    spouse_monthly_income: int = 0
    # 자녀
    num_children: int = 0       # 만 30세 미만 미혼 자녀
    has_newborn: bool = False   # 만 2세 미만 자녀 있음
    # 부모
    parents_living_together: bool = False
    parents_monthly_income: int = 0   # 동거 부모 합산 월소득
    # 형제자매
    siblings_living_together: int = 0
    # 자산 (간이)
    real_estate_value: int = 0  # 보유 부동산 가액 (만원 단위 입력 → 원으로 받음)
    financial_assets: int = 0   # 금융자산 합계


# ─────────────────────────────────────────────────────────
# 결과 모델
# ─────────────────────────────────────────────────────────
Status = Literal["eligible", "conditional", "ineligible"]


@dataclass
class EligibilityResult:
    program_id: str
    program_name: str
    category: str               # "기초생활보장", "청약", "주거지원", "대출"
    status: Status
    status_label: str           # "✅ 자격 가능", "⚠️ 추가확인 필요", "❌ 자격 없음"
    household_size: int         # 이 제도 기준 가구원 수
    combined_income: int        # 이 제도 기준 합산 월소득
    threshold_pct: int          # 적용 % 한도
    threshold_amount: int       # 한도 금액 (월)
    my_percent: float           # 가구원수 기준 중위소득 대비 %
    reasoning: str              # 한 줄 판정 근거
    notes: List[str] = field(default_factory=list)  # 추가 조건/주의


# ─────────────────────────────────────────────────────────
# 헬퍼
# ─────────────────────────────────────────────────────────
def _status_from_pct(my_pct: float, threshold_pct: int) -> tuple[Status, str]:
    if my_pct <= threshold_pct:
        return ("eligible", "✅ 소득 기준 충족")
    elif my_pct <= threshold_pct + 5:
        return ("conditional", "⚠️ 경계선 (재계산 권장)")
    else:
        return ("ineligible", "❌ 소득 초과")


def _household_size_basic(p: UserProfile) -> int:
    """주민등록 동일세대 기준 가구원 수 (생계/의료/주거/교육급여 공통)."""
    size = 1  # 본인
    if p.is_married and p.spouse_living_together:
        size += 1
    size += p.num_children
    if p.parents_living_together:
        size += 2  # 부+모 가정 (한 분이면 사용자가 -1 해서 입력하도록 안내)
    size += p.siblings_living_together
    return size


def _household_income_basic(p: UserProfile) -> int:
    income = p.monthly_income
    if p.is_married and p.spouse_living_together:
        income += p.spouse_monthly_income
    if p.parents_living_together:
        income += p.parents_monthly_income
    return income


# ─────────────────────────────────────────────────────────
# 제도별 판정 함수 (6개)
# ─────────────────────────────────────────────────────────
def check_생계급여(p: UserProfile) -> EligibilityResult:
    size = _household_size_basic(p)
    income = _household_income_basic(p)
    median = get_median_income(p.year, size)
    threshold_pct = 32
    threshold_amount = int(median * threshold_pct / 100)
    my_pct = (income / median) * 100
    status, label = _status_from_pct(my_pct, threshold_pct)
    return EligibilityResult(
        program_id="생계급여",
        program_name="생계급여 (기초생활보장)",
        category="기초생활보장",
        status=status,
        status_label=label,
        household_size=size,
        combined_income=income,
        threshold_pct=threshold_pct,
        threshold_amount=threshold_amount,
        my_percent=my_pct,
        reasoning=f"동일세대 {size}인 기준, 가구 월소득 {income:,}원 = 중위 {my_pct:.1f}%",
        notes=[
            "재산 기준(자동차·금융자산·부동산) 별도 적용",
            "근로·사업소득 30% 공제 등 소득인정액 산정 별도",
            "2025년부터 부양의무자 기준 폐지",
        ],
    )


def check_주거급여(p: UserProfile) -> EligibilityResult:
    size = _household_size_basic(p)
    income = _household_income_basic(p)
    median = get_median_income(p.year, size)
    threshold_pct = 48
    threshold_amount = int(median * threshold_pct / 100)
    my_pct = (income / median) * 100
    status, label = _status_from_pct(my_pct, threshold_pct)
    return EligibilityResult(
        program_id="주거급여",
        program_name="주거급여 (기초생활보장)",
        category="기초생활보장",
        status=status,
        status_label=label,
        household_size=size,
        combined_income=income,
        threshold_pct=threshold_pct,
        threshold_amount=threshold_amount,
        my_percent=my_pct,
        reasoning=f"동일세대 {size}인 기준, 가구 월소득 {income:,}원 = 중위 {my_pct:.1f}%",
        notes=[
            "임차가구는 임차급여, 자가가구는 수선유지급여",
            "지역별 기준임대료 한도 별도",
        ],
    )


def check_청년월세(p: UserProfile) -> EligibilityResult:
    """청년월세 한시 특별지원: 본인가구 60% & 원가구 100% 이하."""
    if not (19 <= p.age <= 34):
        return EligibilityResult(
            program_id="청년월세",
            program_name="청년월세 한시 특별지원",
            category="주거지원",
            status="ineligible",
            status_label="❌ 연령 미충족",
            household_size=0,
            combined_income=0,
            threshold_pct=60,
            threshold_amount=0,
            my_percent=0,
            reasoning=f"만 {p.age}세 — 만 19~34세 청년만 대상",
            notes=[],
        )
    if p.is_homeowner:
        return EligibilityResult(
            program_id="청년월세",
            program_name="청년월세 한시 특별지원",
            category="주거지원",
            status="ineligible",
            status_label="❌ 무주택 요건 미충족",
            household_size=0,
            combined_income=0,
            threshold_pct=60,
            threshold_amount=0,
            my_percent=0,
            reasoning="유주택자는 신청 불가",
            notes=[],
        )

    # 본인가구 (본인 또는 본인+배우자)
    self_size = 1 + (1 if p.is_married and p.spouse_living_together else 0)
    self_income = p.monthly_income + (p.spouse_monthly_income if p.is_married and p.spouse_living_together else 0)
    self_median = get_median_income(p.year, self_size)
    self_pct = (self_income / self_median) * 100

    # 원가구 (본인 + 부모 가정 — 만 30세 이상 미혼이거나 결혼했으면 원가구 소득 미적용)
    skip_origin = (p.age >= 30) or p.is_married
    origin_pct = None
    notes = [
        "보증금 1.5억·월세 70만원 이하 주택 거주 (월세 60 초과시 보증금 환산 합산)",
        "월 최대 20만원 × 12개월 (총 240만원) 지원",
    ]
    if skip_origin:
        notes.append(f"만 {p.age}세 / 결혼={p.is_married} → 원가구 소득기준 미적용 케이스 가능")
    else:
        origin_size = 1 + 2  # 본인 + 부모 2명 가정
        origin_income = p.monthly_income + p.parents_monthly_income
        origin_median = get_median_income(p.year, origin_size)
        origin_pct = (origin_income / origin_median) * 100
        notes.insert(0, f"원가구(본인+부모 {origin_size}인): {origin_income:,}원 = 중위 {origin_pct:.1f}% (한도 100%)")

    self_ok = self_pct <= 60
    origin_ok = (origin_pct is None) or (origin_pct <= 100)

    if self_ok and origin_ok:
        status, label = ("eligible", "✅ 소득 기준 충족")
    elif self_pct > 60:
        status, label = ("ineligible", f"❌ 본인가구 소득 초과 (중위 {self_pct:.1f}%)")
    else:
        status, label = ("ineligible", f"❌ 원가구 소득 초과 (중위 {origin_pct:.1f}%)" if origin_pct else ("ineligible", "❌"))

    return EligibilityResult(
        program_id="청년월세",
        program_name="청년월세 한시 특별지원",
        category="주거지원",
        status=status,
        status_label=label,
        household_size=self_size,
        combined_income=self_income,
        threshold_pct=60,
        threshold_amount=int(self_median * 0.6),
        my_percent=self_pct,
        reasoning=f"본인가구 {self_size}인: {self_income:,}원 = 중위 {self_pct:.1f}% (한도 60%)",
        notes=notes,
    )


def check_신혼특공(p: UserProfile) -> EligibilityResult:
    """공공분양 신혼부부 특별공급 (혼인 7년 이내 가정)."""
    if not p.is_married:
        return EligibilityResult(
            program_id="신혼특공",
            program_name="신혼부부 특별공급 (공공분양)",
            category="청약",
            status="ineligible",
            status_label="❌ 혼인 요건 미충족",
            household_size=0,
            combined_income=0,
            threshold_pct=120,
            threshold_amount=0,
            my_percent=0,
            reasoning="혼인신고한 부부 또는 예비신혼부부만 대상",
            notes=["예비신혼부부(입주 전 혼인 예정)도 신청 가능"],
        )
    if p.is_homeowner:
        return EligibilityResult(
            program_id="신혼특공",
            program_name="신혼부부 특별공급 (공공분양)",
            category="청약",
            status="ineligible",
            status_label="❌ 무주택 세대구성원 요건 미충족",
            household_size=0,
            combined_income=0,
            threshold_pct=120,
            threshold_amount=0,
            my_percent=0,
            reasoning="세대 구성원 전원 무주택 필요",
            notes=[],
        )

    is_dual_income = p.spouse_monthly_income > 0
    size = 2 + p.num_children  # 부부 + 자녀 (한부모는 별도 처리 생략)
    income = p.monthly_income + p.spouse_monthly_income
    median = get_median_income(p.year, size)
    my_pct = (income / median) * 100

    # 외벌이 100%, 맞벌이 120% (우선공급)
    threshold_pct = 120 if is_dual_income else 100
    threshold_amount = int(median * threshold_pct / 100)
    status, label = _status_from_pct(my_pct, threshold_pct)

    notes = [
        "혼인신고 7년 이내 + 무주택 세대구성원 전원 + 청약통장 가입 6개월·6회 납입",
        f"{'맞벌이' if is_dual_income else '외벌이'} 기준 우선공급 한도 {threshold_pct}% 적용",
        "일반공급(외벌이 130/맞벌이 140%) 및 추첨제(180/200%) 별도 존재",
        "자산 기준(부동산 + 자동차) 별도 적용",
    ]
    if p.has_newborn:
        notes.append("🍼 신생아 특별공급(별도): 2세 이하 자녀 있으면 우선 배정")

    return EligibilityResult(
        program_id="신혼특공",
        program_name="신혼부부 특별공급 (공공분양 우선공급)",
        category="청약",
        status=status,
        status_label=label,
        household_size=size,
        combined_income=income,
        threshold_pct=threshold_pct,
        threshold_amount=threshold_amount,
        my_percent=my_pct,
        reasoning=f"부부+자녀 {size}인, 부부합산 {income:,}원 = 중위 {my_pct:.1f}%",
        notes=notes,
    )


def check_청년매입임대(p: UserProfile) -> EligibilityResult:
    """LH 청년 매입임대주택 (1·2·3순위 자동 판정)."""
    if not (19 <= p.age <= 39):
        return EligibilityResult(
            program_id="청년매입임대",
            program_name="청년 매입임대주택 (LH)",
            category="주거지원",
            status="ineligible",
            status_label="❌ 연령 미충족",
            household_size=1,
            combined_income=p.monthly_income,
            threshold_pct=100,
            threshold_amount=0,
            my_percent=0,
            reasoning=f"만 {p.age}세 — 만 19~39세 미혼만 대상",
            notes=[],
        )
    if p.is_married:
        return EligibilityResult(
            program_id="청년매입임대",
            program_name="청년 매입임대주택 (LH)",
            category="주거지원",
            status="ineligible",
            status_label="❌ 혼인 — 청년 매입임대 대상 아님",
            household_size=1,
            combined_income=p.monthly_income,
            threshold_pct=100,
            threshold_amount=0,
            my_percent=0,
            reasoning="미혼 청년만 대상 (신혼부부 매입임대는 별도)",
            notes=["기혼이라면 신혼부부 매입임대 II/III 확인"],
        )
    if p.is_homeowner:
        return EligibilityResult(
            program_id="청년매입임대",
            program_name="청년 매입임대주택 (LH)",
            category="주거지원",
            status="ineligible",
            status_label="❌ 무주택 요건 미충족",
            household_size=1,
            combined_income=p.monthly_income,
            threshold_pct=100,
            threshold_amount=0,
            my_percent=0,
            reasoning="무주택자만 신청 가능",
            notes=[],
        )

    # 2순위: 본인+부모 합산 100% (1인 가구는 120%)
    rank2_size = 1 + 2  # 본인 + 부모 2명
    rank2_income = p.monthly_income + p.parents_monthly_income
    rank2_median = get_median_income(p.year, rank2_size)
    rank2_pct = (rank2_income / rank2_median) * 100

    # 3순위: 본인만 100% (1인은 120%)
    rank3_pct = (p.monthly_income / get_median_income(p.year, 1)) * 100

    # 순위 결정
    if rank2_pct <= 100:
        rank = "2순위 (본인+부모 100% 이하)"
        status, label = ("eligible", f"✅ 2순위 자격 (원가구 중위 {rank2_pct:.1f}%)")
        size, income, my_pct, thr = rank2_size, rank2_income, rank2_pct, 100
    elif rank3_pct <= 120:
        rank = "3순위 (본인 100%/120% 이하)"
        status, label = ("eligible", f"✅ 3순위 자격 (본인 중위 {rank3_pct:.1f}%)")
        size, income, my_pct, thr = 1, p.monthly_income, rank3_pct, 120
    else:
        rank = "순위 외"
        status, label = ("ineligible", "❌ 소득 초과")
        size, income, my_pct, thr = 1, p.monthly_income, rank3_pct, 120

    return EligibilityResult(
        program_id="청년매입임대",
        program_name=f"청년 매입임대주택 (LH) — {rank}",
        category="주거지원",
        status=status,
        status_label=label,
        household_size=size,
        combined_income=income,
        threshold_pct=thr,
        threshold_amount=int(get_median_income(p.year, size) * thr / 100),
        my_percent=my_pct,
        reasoning=f"2순위 검사: 본인+부모 {rank2_pct:.1f}% / 3순위 검사: 본인 {rank3_pct:.1f}%",
        notes=[
            "1순위(생계/의료/주거급여 수급자, 차상위, 한부모, 보호종료 아동) 별도 우대",
            "자산 기준(총자산·자동차) 별도 적용",
            "지역·평형별 임대료 상이",
        ],
    )


def check_디딤돌대출(p: UserProfile) -> EligibilityResult:
    """주택도시기금 디딤돌 대출 (주택구입자금)."""
    if not p.is_household_head:
        return EligibilityResult(
            program_id="디딤돌",
            program_name="디딤돌 대출 (주택구입자금)",
            category="대출",
            status="conditional",
            status_label="⚠️ 세대주 요건 확인 필요",
            household_size=0,
            combined_income=0,
            threshold_pct=0,
            threshold_amount=0,
            my_percent=0,
            reasoning="대출 실행 시점 무주택 세대주 필요",
            notes=["대출 실행 전 세대 분리 가능"],
        )

    # 부부합산 연소득 기준
    annual_income = (p.monthly_income + (p.spouse_monthly_income if p.is_married else 0)) * 12

    # 한도: 일반 6천 / 신혼부부 또는 2자녀 이상 8.5천 / 생애최초 7천 / 신생아 1.3억
    if p.has_newborn:
        annual_limit = 130_000_000
        case = "신생아 특례 (2세 이하 자녀)"
    elif p.is_married or p.num_children >= 2:
        annual_limit = 85_000_000
        case = "신혼부부 또는 2자녀 이상"
    else:
        annual_limit = 60_000_000
        case = "일반 (생애최초는 7,000만원)"

    eligible = annual_income <= annual_limit
    status = "eligible" if eligible else "ineligible"
    label = "✅ 소득 기준 충족" if eligible else "❌ 연소득 초과"

    return EligibilityResult(
        program_id="디딤돌",
        program_name="디딤돌 대출 (주택구입자금)",
        category="대출",
        status=status,
        status_label=label,
        household_size=2 if p.is_married else 1,
        combined_income=annual_income // 12,
        threshold_pct=0,
        threshold_amount=annual_limit // 12,
        my_percent=0,
        reasoning=f"{case} — 연소득 {annual_income:,}원 (한도 {annual_limit:,}원)",
        notes=[
            "총자산 4.69억원 이하 (2024년 기준)",
            "주택가격 5억(신혼·2자녀 6억) 이하",
            "전용 85㎡ 이하 (수도권 외 100㎡)",
        ],
    )


# ─────────────────────────────────────────────────────────
# 디스패치
# ─────────────────────────────────────────────────────────
ALL_CHECKS: List[Callable[[UserProfile], EligibilityResult]] = [
    check_생계급여,
    check_주거급여,
    check_청년월세,
    check_신혼특공,
    check_청년매입임대,
    check_디딤돌대출,
]


def evaluate_all(profile: UserProfile) -> List[EligibilityResult]:
    """모든 제도 체크 결과를 status 우선순위로 정렬해서 반환."""
    results = [chk(profile) for chk in ALL_CHECKS]
    order = {"eligible": 0, "conditional": 1, "ineligible": 2}
    results.sort(key=lambda r: (order[r.status], r.category))
    return results
