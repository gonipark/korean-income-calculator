"""
기준중위소득 조회 & 내 소득 위치 계산기 (Streamlit).

실행:
    streamlit run app.py
"""

import streamlit as st

from data import (
    COMMON_PERCENTS,
    MEDIAN_INCOME,
    PROGRAMS_BY_PERCENT,
    find_applicable_programs,
    get_median_income,
)
from eligibility import UserProfile, evaluate_all

st.set_page_config(
    page_title="기준중위소득 조회기",
    page_icon="💰",
    layout="wide",
)

st.title("💰 기준중위소득 조회기")
st.caption("청약·복지 제도에서 쓰이는 모든 소득 기준을 한 번에 확인하세요.")

# ─────────────────────────────────────────────────────────
# 사이드바: 공통 입력
# ─────────────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ 기본 정보")
    available_years = sorted(MEDIAN_INCOME.keys(), reverse=True)
    year = st.selectbox("기준 연도", available_years, index=0)
    household_size = st.number_input(
        "가구원 수",
        min_value=1,
        max_value=15,
        value=1,
        step=1,
        help="본인 포함 같은 주민등록 세대원 수. 8인 이상도 자동 계산됩니다.",
    )

    base_income = get_median_income(year, household_size)
    st.metric(
        f"{household_size}인 가구 100% (월)",
        f"{base_income:,}원",
    )
    st.caption(f"연 환산: {base_income * 12:,}원")

    st.divider()
    st.caption(
        "📌 데이터 출처: 보건복지부 중앙생활보장위원회 고시.\n\n"
        "정확한 자격 판단은 각 제도의 공식 안내를 확인하세요."
    )

# ─────────────────────────────────────────────────────────
# 메인: 두 가지 탭
# ─────────────────────────────────────────────────────────
tab0, tab1, tab2, tab3 = st.tabs(
    [
        "🎯 내 상황 진단",
        "🔍 % 별 금액 조회",
        "📊 내 소득은 몇 %?",
        "📋 가구원 수 전체표",
    ]
)

# ─────────────── Tab 0: 상황 진단 위저드 ───────────────
with tab0:
    st.subheader("내 상황으로 자격 가능한 제도 찾기")
    st.write(
        "11개 질문에 답하면 6개 주요 제도(생계급여·주거급여·청년월세·신혼특공·청년매입임대·디딤돌)의 "
        "자격 여부를 자동 판정합니다."
    )
    st.info(
        "💡 제도마다 '가구원 수'와 '합산 소득' 산정 방식이 달라요. "
        "예를 들어 청년월세는 '본인 소득'을, 신혼특공은 '부부합산'을, 생계급여는 '주민등록 동일세대 전체'를 봅니다. "
        "이 위저드가 그 차이를 자동으로 처리해줘요."
    )

    with st.form("situation_wizard"):
        st.markdown("##### 1️⃣ 본인 정보")
        c1, c2 = st.columns(2)
        with c1:
            w_age = st.number_input("만 나이", 0, 100, 30)
            w_homeowner = st.radio(
                "주택 소유 여부",
                ["무주택", "유주택"],
                horizontal=True,
            ) == "유주택"
        with c2:
            w_head = st.radio(
                "주민등록상 세대주?",
                ["세대주", "세대원"],
                horizontal=True,
            ) == "세대주"
            w_income = st.number_input(
                "본인 월소득 (원)", 0, 100_000_000, 3_000_000, 100_000
            )

        st.divider()
        st.markdown("##### 2️⃣ 배우자")
        w_married = st.radio(
            "결혼 여부",
            ["미혼", "기혼"],
            horizontal=True,
        ) == "기혼"
        w_spouse_living = False
        w_spouse_income = 0
        if w_married:
            c1, c2 = st.columns(2)
            with c1:
                w_spouse_living = st.checkbox("배우자와 동거 중", value=True)
            with c2:
                w_spouse_income = st.number_input(
                    "배우자 월소득 (원, 외벌이면 0)",
                    0, 100_000_000, 0, 100_000,
                )

        st.divider()
        st.markdown("##### 3️⃣ 자녀")
        c1, c2 = st.columns(2)
        with c1:
            w_children = st.number_input(
                "자녀 수 (만 30세 미만 미혼)", 0, 10, 0
            )
        with c2:
            w_newborn = st.checkbox(
                "만 2세 미만 자녀 있음", value=False,
                help="신생아 특례(디딤돌·신혼특공) 자동 판정용",
            )

        st.divider()
        st.markdown("##### 4️⃣ 부모·형제")
        c1, c2 = st.columns(2)
        with c1:
            w_parents_living = st.checkbox(
                "부모와 동거 중", value=False,
                help="동거 부모는 가구원 수에 포함됩니다 (생계/주거급여 등)",
            )
            w_parents_income = 0
            if w_parents_living:
                w_parents_income = st.number_input(
                    "동거 부모 월소득 합계 (원)",
                    0, 100_000_000, 0, 100_000,
                )
        with c2:
            w_siblings = st.number_input(
                "동거 형제자매 수", 0, 10, 0
            )

        st.divider()
        st.markdown("##### 5️⃣ 자산 (간이)")
        c1, c2 = st.columns(2)
        with c1:
            w_re_value = st.number_input(
                "보유 부동산 가액 (원)", 0, 10_000_000_000, 0, 10_000_000,
                help="없으면 0",
            )
        with c2:
            w_fin = st.number_input(
                "금융자산 합계 (원)", 0, 10_000_000_000, 0, 1_000_000,
            )

        submitted = st.form_submit_button("🎯 진단하기", type="primary", use_container_width=True)

    if submitted:
        profile = UserProfile(
            year=year,
            age=w_age,
            is_homeowner=w_homeowner,
            is_household_head=w_head,
            monthly_income=w_income,
            is_married=w_married,
            spouse_living_together=w_spouse_living,
            spouse_monthly_income=w_spouse_income,
            num_children=w_children,
            has_newborn=w_newborn,
            parents_living_together=w_parents_living,
            parents_monthly_income=w_parents_income,
            siblings_living_together=w_siblings,
            real_estate_value=w_re_value,
            financial_assets=w_fin,
        )
        results = evaluate_all(profile)
        eligible = [r for r in results if r.status == "eligible"]
        conditional = [r for r in results if r.status == "conditional"]
        ineligible = [r for r in results if r.status == "ineligible"]

        st.divider()
        c1, c2, c3 = st.columns(3)
        c1.metric("✅ 자격 가능", len(eligible))
        c2.metric("⚠️ 추가확인", len(conditional))
        c3.metric("❌ 자격 없음", len(ineligible))

        if eligible:
            st.markdown("### ✅ 자격 가능한 제도")
            for r in eligible:
                with st.container(border=True):
                    st.markdown(f"**{r.program_name}** · _{r.category}_")
                    st.caption(r.status_label)
                    cc1, cc2, cc3 = st.columns(3)
                    cc1.metric("적용 가구원 수", f"{r.household_size}인")
                    cc2.metric("합산 월소득", f"{r.combined_income:,}원")
                    if r.threshold_pct:
                        cc3.metric(
                            f"한도 (중위 {r.threshold_pct}%)",
                            f"{r.threshold_amount:,}원",
                        )
                    st.markdown(f"📐 **판정 근거:** {r.reasoning}")
                    if r.notes:
                        with st.expander("추가 조건/주의사항"):
                            for note in r.notes:
                                st.markdown(f"- {note}")

        if conditional:
            st.markdown("### ⚠️ 추가 확인 필요")
            for r in conditional:
                with st.container(border=True):
                    st.markdown(f"**{r.program_name}** · _{r.category}_")
                    st.caption(r.status_label)
                    st.markdown(f"📐 {r.reasoning}")
                    if r.notes:
                        for note in r.notes:
                            st.caption(f"• {note}")

        if ineligible:
            with st.expander(f"❌ 자격 없는 제도 ({len(ineligible)}개) 보기"):
                for r in ineligible:
                    st.markdown(f"- **{r.program_name}** — {r.status_label}")
                    st.caption(f"  {r.reasoning}")

        st.divider()
        st.warning(
            "⚠️ **본 진단은 소득 기준 1차 스크리닝 결과입니다.** "
            "실제 자격은 자산·연령·무주택 기간·청약통장·지역 등 추가 조건이 적용되며, "
            "제도 세부 요건은 매년 변경됩니다. 신청 전 반드시 공식 안내(보건복지부, LH, "
            "마이홈포털, 주택도시보증공사 등)를 확인하세요."
        )

# ─────────────── Tab 1: 비율별 금액 조회 ───────────────
with tab1:
    st.subheader(f"{year}년 · {household_size}인 가구 기준")
    st.write("청약·복지 제도에서 자주 쓰이는 비율별 월소득 기준입니다.")

    rows = []
    for pct in COMMON_PERCENTS:
        amount = int(base_income * pct / 100)
        programs = PROGRAMS_BY_PERCENT.get(pct, [])
        program_names = ", ".join(name for name, _ in programs) if programs else "—"
        rows.append(
            {
                "비율": f"{pct}%",
                "월 소득 (원)": f"{amount:,}",
                "연 소득 (원)": f"{amount * 12:,}",
                "주요 제도": program_names,
            }
        )

    st.dataframe(rows, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("✏️ 직접 비율 입력")
    custom_pct = st.slider("비율 (%)", min_value=10, max_value=300, value=100, step=5)
    custom_amount = int(base_income * custom_pct / 100)
    col1, col2 = st.columns(2)
    col1.metric(f"중위소득 {custom_pct}% (월)", f"{custom_amount:,}원")
    col2.metric(f"중위소득 {custom_pct}% (연)", f"{custom_amount * 12:,}원")

# ─────────────── Tab 2: 내 소득 → 위치 계산 ───────────────
with tab2:
    st.subheader("내 소득은 중위소득의 몇 %?")
    st.write("월 소득을 입력하면 중위소득 대비 비율과 자격 가능한 제도를 알려줍니다.")

    col_a, col_b = st.columns(2)
    with col_a:
        input_mode = st.radio(
            "입력 단위",
            ["월 소득", "연 소득"],
            horizontal=True,
        )
    with col_b:
        if input_mode == "월 소득":
            my_income = st.number_input(
                "월 소득 (원)",
                min_value=0,
                value=3_000_000,
                step=100_000,
                format="%d",
            )
            monthly_income = my_income
        else:
            my_income = st.number_input(
                "연 소득 (원)",
                min_value=0,
                value=36_000_000,
                step=1_000_000,
                format="%d",
            )
            monthly_income = my_income // 12

    if monthly_income > 0:
        my_percent = (monthly_income / base_income) * 100

        st.divider()

        col1, col2, col3 = st.columns(3)
        col1.metric("내 월 소득", f"{monthly_income:,}원")
        col2.metric(f"{household_size}인 가구 중위소득 100%", f"{base_income:,}원")
        col3.metric("내 위치", f"{my_percent:.1f}%")

        # 시각적 게이지
        progress_value = min(my_percent / 200, 1.0)
        st.progress(progress_value, text=f"중위소득 대비 {my_percent:.1f}% (200% 기준 막대)")

        st.divider()
        st.subheader("🎯 자격 가능성 있는 제도")
        st.caption(
            "아래 제도들은 '소득 기준'만 비교한 결과입니다. "
            "실제 신청은 자산·연령·무주택 여부 등 추가 조건이 있으니 공식 안내를 꼭 확인하세요."
        )

        applicable = find_applicable_programs(my_percent)
        if not applicable:
            st.warning(
                f"입력하신 소득({my_percent:.1f}%)은 등록된 제도들의 일반적 소득 상한선을 넘습니다. "
                "고소득자 대상 제도(예: 일부 민영 청약)는 별도로 확인하세요."
            )
        else:
            # 제도 카드 형태로 출력
            current_threshold = None
            for threshold, name, desc in applicable:
                if threshold != current_threshold:
                    st.markdown(f"##### 📌 중위소득 {threshold}% 이하 제도")
                    current_threshold = threshold
                with st.container(border=True):
                    st.markdown(f"**{name}**")
                    st.caption(desc)

# ─────────────── Tab 3: 가구원 수 × 비율 전체표 ───────────────
with tab3:
    st.subheader(f"{year}년 가구원 수 × 비율 전체표 (월 소득)")
    st.write("가구원 수와 비율 조합을 한눈에 비교할 수 있는 전체표입니다.")

    sizes = list(range(1, 8))
    table_rows = []
    for pct in COMMON_PERCENTS:
        row = {"비율": f"{pct}%"}
        for s in sizes:
            base = get_median_income(year, s)
            row[f"{s}인"] = f"{int(base * pct / 100):,}"
        table_rows.append(row)

    st.dataframe(table_rows, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("📚 주요 제도별 소득 기준 요약")
    for pct in sorted(PROGRAMS_BY_PERCENT.keys()):
        with st.expander(f"중위소득 {pct}% 이하 제도"):
            for name, desc in PROGRAMS_BY_PERCENT[pct]:
                st.markdown(f"- **{name}** — {desc}")

st.divider()
st.caption(
    "ⓘ 본 사이트는 참고용입니다. 실제 자격 여부는 각 제도 공식 안내(보건복지부, "
    "LH, HUG, 마이홈포털 등)를 통해 반드시 확인하세요."
)
