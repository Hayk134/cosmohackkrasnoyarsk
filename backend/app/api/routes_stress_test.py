"""backend/app/api/routes_stress_test.py

Climate Black Swan Stress-Testing & Catastrophe Simulator (TCFD Standard):
- POST /api/stress-test/simulate
- Evaluates 2025-2035 climate catastrophes on forest carbon projects
- Dynamic buffer pool survival test, stressed NPV, and mitigation protocols
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.api.routes_sites import load_preset_sites
from backend.app.api.routes_ai import get_gemini_api_key

router = APIRouter(prefix="/stress-test", tags=["Climate Stress-Testing (TCFD)"])


class StressTestRequest(BaseModel):
    site_id: str = Field("RU_TVER_01", description="Идентификатор полигона")
    scenario_type: str = Field("drought_2027", description="Тип климатического шока")
    severity: float = Field(0.5, ge=0.1, le=1.0, description="Интенсивность сценария (0.1 - 1.0)")
    buffer_pool_pct: float = Field(20.0, ge=5.0, le=40.0, description="Размер буферного пула (%)")
    carbon_price_rub: float = Field(1500.0, description="Цена углеродной единицы (руб/т CO2)")
    custom_area_ha: Optional[float] = Field(None, description="Пользовательская площадь (га)")
    custom_site_name: Optional[str] = Field(None, description="Пользовательское название полигона")
    custom_scenario: Optional[Dict[str, Any]] = Field(None, description="Пользовательский сценарий, созданный AI")


class GenerateScenarioRequest(BaseModel):
    prompt: str = Field(..., description="Текстовый промпт катастрофы")
    site_id: Optional[str] = Field("RU_TVER_01", description="Идентификатор полигона")


class GeneratedScenarioResponse(BaseModel):
    id: str
    name: str
    description: str
    risk_category: str
    climate_index: str
    base_loss_factor: float
    severity_loss_slope: float
    mitigation_actions: List[str]


class InitialMetrics(BaseModel):
    agb_t_ha: float
    cumulative_gross_co2: float
    buffer_reserve_co2: float
    tradable_credits_co2: float
    base_npv_rub: float
    base_payback_years: float


class ShockImpact(BaseModel):
    post_shock_agb_t_ha: float
    agb_loss_pct: float
    carbon_loss_t_co2: float
    damaged_area_ha: float
    buffer_absorbed_co2: float
    uncovered_deficit_co2: float
    buffer_remaining_pct: float
    buffer_status: str  # SURVIVED | DEFICIT
    buffer_status_label: str


class FinancialImpact(BaseModel):
    stressed_npv_rub: float
    delta_npv_rub: float
    stressed_payback_years: float
    revenue_loss_rub: float
    resilience_score: int
    resilience_grade: str


class TCFDDisclosure(BaseModel):
    risk_category: str
    climate_index: str
    scenario_name: str
    scenario_description: str
    mitigation_actions: List[str]
    auditor_conclusion: str


class StressTestResponse(BaseModel):
    site_id: str
    site_name: str
    region: str
    area_ha: float
    severity: float
    severity_pct: int
    initial_metrics: InitialMetrics
    shock_impact: ShockImpact
    financial_impact: FinancialImpact
    tcfd_disclosure: TCFDDisclosure
    timestamp: str


SCENARIO_CONFIGS: Dict[str, Dict[str, Any]] = {
    "drought_2027": {
        "name": "Экстремальная засуха 2027 года (IPCC CMIP6 SSP5-8.5)",
        "description": "Аномальный дефицит влаги в почве (SPEI < -2.15), снижение транспирации кроны и частичный отпад древостоя.",
        "risk_category": "Физический острый и хронический риск (TCFD Acute & Chronic)",
        "climate_index": "SPEI-3 = -2.18 σ (дефицит осадков 58 дней, Т° +3.4°C от климатической нормы)",
        "base_loss_factor": 0.08,
        "severity_loss_slope": 0.14,
        "mitigation_actions": [
            "Создание минерализованных защитных полос шириной 1.8 м по внешнему периметру полигона.",
            "Переход на радарный мониторинг Sentinel-1 (C-SAR) с 12-дневным циклом для контроля влажности биомассы.",
            "Резервирование дополнительного 5% пула углеродных квот на случай затяжной фазы дефицита осадков.",
            "Обустройство водозаборных емкостей и пожарных водоемов в радиусе 3 км от ключевых лесных кластеров.",
        ],
    },
    "wildfire": {
        "name": "Лесной низовой и почвенный пожар",
        "description": "Пирогенная эмиссия углерода при локальном возгорании подстилки и сухостоя в период высокой пожароопасности (KBDI > 650).",
        "risk_category": "Физический острый риск (TCFD Acute Wildfire Risk)",
        "climate_index": "Nesterov Index > 12,000 (V чрезвычайный класс пожарной опасности, MODIS/FIRMS)",
        "base_loss_factor": 0.05,
        "severity_loss_slope": 0.18,
        "mitigation_actions": [
            "Интеграция круглосуточного спутникового алерта термоточек NASA FIRMS / VIIRS 375m.",
            "Прокладка разрывов и противопожарных опушек с высадкой лиственных пород (береза, ольха).",
            "Страхование углеродных пулов в параметрическом пуле с выплатой при фиксации термических аномалий.",
            "Внеплановый спутниковый аудит Sentinel-2 dNBR (Differenced Normalized Burn Ratio) для фиксации гарей.",
        ],
    },
    "pest_outbreak": {
        "name": "Вспышка стволовых вредителей (Короед-типограф)",
        "description": "Массовое размножение вредителей после засушливого лета с очаговым усыханием еловых и сосновых насаждений.",
        "risk_category": "Биотический фактор деградации биомассы (TCFD Chronic Ecosystem Risk)",
        "climate_index": "NDVI Anomalies < -0.22, очаги усыхания первого яруса полога древостоя",
        "base_loss_factor": 0.04,
        "severity_loss_slope": 0.12,
        "mitigation_actions": [
            "Выборочные санитарные рубки с вывозом порубочных остатков до начала весеннего лёта жуков.",
            "Использование феромонных ловушек по границам очагов с радиусом перехвата 250 м.",
            "Мониторинг индекса REP (Red Edge Position) на спутниках Sentinel-2 для раннего детектирования хлороза хвои.",
            "Подсадка устойчивых аборигенных широколиственных видов для формирования мозаичного смешанного леса.",
        ],
    },
    "windthrow": {
        "name": "Шквальный ветровал и снеголом",
        "description": "Механическое повреждение стволов при прохождении глубокого атлантического циклона с порывами ветра свыше 27 м/с.",
        "risk_category": "Физический острый риск штормовых явлений (TCFD Extreme Weather)",
        "climate_index": "Скорость ветра V_gust > 28.5 м/с, переувлажнение верхнего горизонта почвы",
        "base_loss_factor": 0.03,
        "severity_loss_slope": 0.09,
        "mitigation_actions": [
            "Срочная раскряжевка и реализация ветровальной древесины во избежание вспышки вторичных вредителей.",
            "Формирование ветроупорных опушек со ступенчатой ярусной структурой.",
            "Детекция поваленных стволов с помощью радарной когерентности Sentinel-1 Interferometric Coherence.",
            "Списание фактического отпада из пула AGB в отчетный год без штрафных санкций реестра.",
        ],
    },
    "combined": {
        "name": "Каскадный климатический шок (Засуха 2027 + Лесной пожар)",
        "description": "Наихудший кумулятивный сценарий: экстремальная засуха провоцирует падение влажности подстилки и масштабный низовой пожар.",
        "risk_category": "Каскадный катастрофический риск (TCFD Compound Severe Risk)",
        "climate_index": "Compound Index: SPEI = -2.25 & KBDI = 740 & Nesterov Class V",
        "base_loss_factor": 0.10,
        "severity_loss_slope": 0.22,
        "mitigation_actions": [
            "Активация режима ЧС проекта и запуск резервного протокола компенсации из гарантийного пула реестра.",
            "Мобилизация добровольных пожарных дружин и круглосуточный БПЛА-мониторинг с тепловизорами.",
            "Проведение полного переучета 5 углеродных пулов с независимой валидацией органом по валидации и верификации (ОВВ).",
            "Реструктуризация финансового графика погашения инвестиций с пролонгацией на 2 вегетационных сезона.",
        ],
    },
}


@router.post(
    "/simulate",
    response_model=StressTestResponse,
    summary="Смоделировать климатический стресс-тест полигона (Black Swan)",
)
def simulate_stress_test(req: StressTestRequest) -> StressTestResponse:
    sites = load_preset_sites()
    selected = next((s for s in sites if s.id == req.site_id), None)

    site_name = req.custom_site_name or (selected.name if selected else req.site_id)
    area_ha = req.custom_area_ha or (selected.area_ha if selected else 1000.0)

    region = "Центральная Россия"
    if "TVER" in req.site_id:
        region = "Тверская область"
    elif "VOLOGDA" in req.site_id:
        region = "Вологодская область"
    elif "MORDOVIA" in req.site_id:
        region = "Республика Мордовия"
    elif "KRASNOYARSK" in req.site_id:
        region = "Красноярский край"

    if req.custom_scenario and isinstance(req.custom_scenario, dict):
        cfg = {
            "name": req.custom_scenario.get("name", "Пользовательский AI-сценарий"),
            "description": req.custom_scenario.get("description", "Смоделировано нейросетью"),
            "risk_category": req.custom_scenario.get("risk_category", "Физический климатический риск (TCFD)"),
            "climate_index": req.custom_scenario.get("climate_index", "Аномальный климатический фактор"),
            "base_loss_factor": float(req.custom_scenario.get("base_loss_factor", 0.07)),
            "severity_loss_slope": float(req.custom_scenario.get("severity_loss_slope", 0.15)),
            "mitigation_actions": req.custom_scenario.get("mitigation_actions", [
                "Спутниковый мониторинг Sentinel-1 SAR влажности биомассы.",
                "Увеличение буферного пула углеродных единиц.",
                "Противопожарные и лесохозяйственные защитные полосы.",
                "Внеплановый аудит 5 углеродных пулов.",
            ]),
        }
    else:
        scenario_key = req.scenario_type if req.scenario_type in SCENARIO_CONFIGS else "drought_2027"
        cfg = SCENARIO_CONFIGS[scenario_key]

    # Исходные 15-летние метрики полигона
    base_agb = 142.5  # т/га
    annual_seq_rate = 3.5  # т CO2/га/год
    project_years = 15
    cumulative_gross_co2 = area_ha * annual_seq_rate * project_years

    buffer_pct = max(5.0, min(40.0, req.buffer_pool_pct))
    buffer_reserve_co2 = cumulative_gross_co2 * (buffer_pct / 100.0)
    tradable_credits_co2 = cumulative_gross_co2 - buffer_reserve_co2

    # Базовая экономика
    base_npv_rub = area_ha * 8700.0
    base_payback_years = 4.0

    # Расчет шока биомассы
    severity = max(0.1, min(1.0, req.severity))
    loss_fraction = cfg["base_loss_factor"] + (cfg["severity_loss_slope"] * severity)
    loss_fraction = min(0.35, loss_fraction)  # Ограничиваем разумным максимумом 35%

    post_shock_agb = round(base_agb * (1.0 - (loss_fraction * 0.7)), 1)
    agb_loss_pct = round(loss_fraction * 100.0, 1)

    # Потеря углерода в эквиваленте CO2
    carbon_loss_t_co2 = round(cumulative_gross_co2 * loss_fraction, 1)
    damaged_area_ha = round(area_ha * min(1.0, loss_fraction * 2.2), 1)

    # Поглощение буферным пулом
    buffer_absorbed = min(buffer_reserve_co2, carbon_loss_t_co2)
    uncovered_deficit = max(0.0, carbon_loss_t_co2 - buffer_reserve_co2)
    buffer_remaining = max(0.0, buffer_reserve_co2 - carbon_loss_t_co2)
    buffer_remaining_pct = round((buffer_remaining / buffer_reserve_co2 * 100.0), 1) if buffer_reserve_co2 > 0 else 0.0

    if uncovered_deficit == 0:
        buffer_status = "SURVIVED"
        buffer_status_label = (
            f"Буферный фонд {buffer_pct:.0f}% полностью нейтрализовал климатический шок. "
            f"Остаток резерва: {buffer_remaining:,.0f} т CO₂ ({buffer_remaining_pct}%). "
            f"Квоты инвестора полностью защищены от списания."
        )
    else:
        buffer_status = "DEFICIT"
        buffer_status_label = (
            f"Буферный фонд исчерпан на 100%. Возник дефицит в {uncovered_deficit:,.0f} т CO₂. "
            f"Требуется погашение за счет аннулирования части рыночных квот или довнесения капитала."
        )

    # Финансовые последствия
    price = req.carbon_price_rub
    revenue_loss_rub = round(carbon_loss_t_co2 * price * 0.65, 0)
    stressed_npv_rub = max(0.0, round(base_npv_rub - (carbon_loss_t_co2 * price * 0.40), 0))
    delta_npv_rub = round(base_npv_rub - stressed_npv_rub, 0)

    # Срок окупаемости удлиняется пропорционально ущербу
    payback_stretch = (carbon_loss_t_co2 / buffer_reserve_co2) * 1.2
    stressed_payback_years = round(min(12.0, base_payback_years + payback_stretch), 1)

    # Индекс стрессоустойчивости (Resilience Score: 0 - 100)
    penalty_carbon = (carbon_loss_t_co2 / cumulative_gross_co2) * 160.0
    penalty_buffer = (100.0 - buffer_remaining_pct) * 0.25
    raw_score = int(100.0 - penalty_carbon - penalty_buffer)
    resilience_score = max(15, min(98, raw_score))

    if resilience_score >= 85:
        resilience_grade = "A+ (Максимальная устойчивость)"
    elif resilience_score >= 70:
        resilience_grade = "A (Высокая устойчивость)"
    elif resilience_score >= 55:
        resilience_grade = "B (Умеренный риск)"
    elif resilience_score >= 40:
        resilience_grade = "C (Повышенный риск)"
    else:
        resilience_grade = "D (Критическая уязвимость)"

    # Формирование заключения аудитора
    auditor_conclusion = (
        f"По результатам стресс-тестирования по сценарию '{cfg['name']}' при жесткости {int(severity*100)}%: "
        f"полигон {site_name} демонстрирует оценку устойчивости {resilience_score}/100 ({resilience_grade}). "
        + (
            "Буферный фонд надежно покрывает риски списания углеродных единиц в реестре РФ."
            if buffer_status == "SURVIVED"
            else "Рекомендуется докапитализация буферного фонда до 25% и страхование климатических рисков."
        )
    )

    return StressTestResponse(
        site_id=req.site_id,
        site_name=site_name,
        region=region,
        area_ha=area_ha,
        severity=severity,
        severity_pct=int(severity * 100),
        initial_metrics=InitialMetrics(
            agb_t_ha=base_agb,
            cumulative_gross_co2=round(cumulative_gross_co2, 1),
            buffer_reserve_co2=round(buffer_reserve_co2, 1),
            tradable_credits_co2=round(tradable_credits_co2, 1),
            base_npv_rub=round(base_npv_rub, 0),
            base_payback_years=base_payback_years,
        ),
        shock_impact=ShockImpact(
            post_shock_agb_t_ha=post_shock_agb,
            agb_loss_pct=agb_loss_pct,
            carbon_loss_t_co2=carbon_loss_t_co2,
            damaged_area_ha=damaged_area_ha,
            buffer_absorbed_co2=round(buffer_absorbed, 1),
            uncovered_deficit_co2=round(uncovered_deficit, 1),
            buffer_remaining_pct=buffer_remaining_pct,
            buffer_status=buffer_status,
            buffer_status_label=buffer_status_label,
        ),
        financial_impact=FinancialImpact(
            stressed_npv_rub=stressed_npv_rub,
            delta_npv_rub=delta_npv_rub,
            stressed_payback_years=stressed_payback_years,
            revenue_loss_rub=revenue_loss_rub,
            resilience_score=resilience_score,
            resilience_grade=resilience_grade,
        ),
        tcfd_disclosure=TCFDDisclosure(
            risk_category=cfg["risk_category"],
            climate_index=cfg["climate_index"],
            scenario_name=cfg["name"],
            scenario_description=cfg["description"],
            mitigation_actions=cfg["mitigation_actions"],
            auditor_conclusion=auditor_conclusion,
        ),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.post(
    "/generate-scenario",
    response_model=GeneratedScenarioResponse,
    summary="Сгенерировать индивидуальный сценарий климатической катастрофы через AI",
)
async def generate_scenario(req: GenerateScenarioRequest) -> GeneratedScenarioResponse:
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Промпт сценария не может быть пустым",
        )

    # Попытка запроса в Google Gemini API
    api_key = get_gemini_api_key()
    model_name = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")

    if api_key:
        system_instruction = (
            "Ты — ведущий риск-аналитик климатических катастроф и стандартов TCFD/IPCC. "
            "Пользователь сформулировал сценарий климатической катастрофы для лесного углеродного проекта. "
            "Твоя задача — вернуть СТРОГО один валидный JSON объект (без markdown кавычек) со следующими ключами:\n"
            "{\n"
            '  "name": "Краткое название катастрофы (3-5 слов)",\n'
            '  "description": "Описание физического процесса и поражения леса (1-2 предложения)",\n'
            '  "risk_category": "Категория риска по TCFD (например, Физический острый риск пожаров)",\n'
            '  "climate_index": "Конкретная климатическая/метеорологическая метрика (например, SPEI = -2.3, Nesterov > 10,000, V_wind > 30 м/с)",\n'
            '  "base_loss_factor": 0.08,\n'
            '  "severity_loss_slope": 0.15,\n'
            '  "mitigation_actions": [\n'
            '    "Конкретная лесохозяйственная мера 1",\n'
            '    "Конкретная спутниковая мера мониторинга 2",\n'
            '    "Финансовая/буферная мера защиты 3",\n'
            '    "Аудиторская мера 4"\n'
            '  ]\n'
            "}"
        )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{system_instruction}\n\nПромпт пользователя: {prompt}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 800,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        content_parts = candidates[0].get("content", {}).get("parts", [])
                        if content_parts and "text" in content_parts[0]:
                            text_resp = content_parts[0]["text"].strip()
                            if text_resp.startswith("```"):
                                text_resp = text_resp.split("```")[1]
                                if text_resp.startswith("json"):
                                    text_resp = text_resp[4:]
                            import json
                            parsed = json.loads(text_resp)
                            sc_id = f"ai_sc_{int(datetime.now().timestamp())}"
                            return GeneratedScenarioResponse(
                                id=sc_id,
                                name=str(parsed.get("name", prompt[:40])),
                                description=str(parsed.get("description", f"Сценарий на основе промпта: {prompt}")),
                                risk_category=str(parsed.get("risk_category", "Физический климатический риск (TCFD)")),
                                climate_index=str(parsed.get("climate_index", "Спутниковая аномалия индекса")),
                                base_loss_factor=max(0.02, min(0.20, float(parsed.get("base_loss_factor", 0.08)))),
                                severity_loss_slope=max(0.05, min(0.30, float(parsed.get("severity_loss_slope", 0.15)))),
                                mitigation_actions=list(parsed.get("mitigation_actions", [
                                    "Создание противопожарных разрывов.",
                                    "Спутниковый мониторинг Sentinel-1 SAR влажности биомассы.",
                                    "Дополнительное буферирование квот.",
                                    "Внеплановый аудит пулов углерода.",
                                ])),
                            )
        except Exception:
            pass

    # Отказоустойчивый экспертный генератор
    lower_p = prompt.lower()
    sc_id = f"ai_sc_{int(datetime.now().timestamp())}"

    if "пожар" in lower_p or "торф" in lower_p or "огонь" in lower_p:
        return GeneratedScenarioResponse(
            id=sc_id,
            name=f"Пирогенный шок: {prompt[:30].strip()}",
            description=f"Экстремальное термическое повреждение полога и подстилки, вызванное сценарием: {prompt}",
            risk_category="Физический острый риск лесных пожаров (TCFD Acute)",
            climate_index="Nesterov Index > 11,500 / MODIS Thermal Anomalies > 380 K",
            base_loss_factor=0.07,
            severity_loss_slope=0.18,
            mitigation_actions=[
                "Круглосуточный термальный мониторинг через NASA FIRMS / VIIRS 375m.",
                "Прокладка минерализованных полос шириной от 2.0 м с шагом 800 м.",
                "Резервирование дополнительного 5% буфера углеродных единиц.",
                "Обустройство искусственных пожарных водоемов по периметру лесного кластера.",
            ],
        )
    elif "засух" in lower_p or "жар" in lower_p or "сух" in lower_p:
        return GeneratedScenarioResponse(
            id=sc_id,
            name=f"Гидрологический шок: {prompt[:30].strip()}",
            description=f"Длительный дефицит почвенной влаги и торможение прироста биомассы: {prompt}",
            risk_category="Физический хронический риск засухи (TCFD Chronic)",
            climate_index="SPEI-3 = -2.28 σ (дефицит влаги > 50 дней, CMIP6)",
            base_loss_factor=0.08,
            severity_loss_slope=0.14,
            mitigation_actions=[
                "Мониторинг диэлектрической проницаемости почвы и транспирации через Sentinel-1 SAR.",
                "Селективный уход за подростом хвойных пород для снижения конкуренции за влагу.",
                "Увеличение буферного фонда до 22% для защиты от списания квот.",
                "Создание защитных лесных кулис для снижения ветрового испарения.",
            ],
        )
    elif "ветер" in lower_p or "ураган" in lower_p or "буря" in lower_p or "шторм" in lower_p:
        return GeneratedScenarioResponse(
            id=sc_id,
            name=f"Штормовой вывал: {prompt[:30].strip()}",
            description=f"Механическое повреждение стволов и ветровал при прохождении циклона: {prompt}",
            risk_category="Физический экстремальный метеорологический риск (TCFD Extreme)",
            climate_index="V_wind > 29.5 м/с (порывы до 34 м/с, барический градиент 6.2 гПа/100км)",
            base_loss_factor=0.05,
            severity_loss_slope=0.12,
            mitigation_actions=[
                "Срочная уборка захламленности и раскряжевка поваленной древесины.",
                "Формирование ветроупорных ступенчатых опушек из березы и осины.",
                "Спутниковое детектирование просветов полога с помощью Sentinel-2.",
                "Оформление форс-мажора в климатическом реестре углеродных единиц.",
            ],
        )
    elif "мороз" in lower_p or "лед" in lower_p or "снег" in lower_p:
        return GeneratedScenarioResponse(
            id=sc_id,
            name=f"Криогенный шок: {prompt[:30].strip()}",
            description=f"Аномальные возвратные заморозки и обледенение крон: {prompt}",
            risk_category="Физический температурный риск (TCFD Temperature Extreme)",
            climate_index="T_min < -6.2°C в период вегетации / Ледяной дождь толщиной > 25 мм",
            base_loss_factor=0.04,
            severity_loss_slope=0.10,
            mitigation_actions=[
                "Оценка повреждения камбия и ростовых почек по спектральным индексам Sentinel-2.",
                "Санитарные мероприятия по удалению обломанных вершин.",
                "Мониторинг вторичной инфекционной нагрузки патогенных грибов.",
                "Корректировка базовой линии годового прироста биомассы.",
            ],
        )
    else:
        return GeneratedScenarioResponse(
            id=sc_id,
            name=f"AI-Стресс-сценарий: {prompt[:32].strip()}",
            description=f"Индивидуальный сценарий климатического стресса полигона: {prompt}",
            risk_category="Комплексный климатический риск (TCFD Compound Physical Risk)",
            climate_index="Ecosystem Stress Index = 8.4/10 (CMIP6 Multi-model Ensemble)",
            base_loss_factor=0.06,
            severity_loss_slope=0.15,
            mitigation_actions=[
                "Усиленный многозональный радарный и оптический мониторинг Sentinel-1/2.",
                "Формирование превентивного минерализованного и санитарного барьера.",
                "Увеличение страхового буфера квот до 20% в реестре углеродных единиц.",
                "Аудит устойчивости 5 углеродных пулов независимым верификатором.",
            ],
        )

