"""商務摘要判讀：不只節錄關鍵字，而是判斷各商務條款的實質內容。

- 合約金額：依上下文關鍵字評分，挑出「這份合約的總價」；定金、履約保證金
  各自歸類，其餘進「其他金額」。
- 違約金（LD）：解析計罰週期、基準、費率（換算 ％）與上限；無上限時標示。
- 付款條件：解析時點＋天數＋方式；保固：期間＋起算點；簽約日期：從落款判斷。

單機版 templates/standalone.html 有對應的 JS 移植，改這裡要同步改那邊並重打包。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .checks import CN_NUM_CHARS, cn_amount_to_int
from .extract import Segment


@dataclass
class SummaryValue:
    text: str
    location: str


@dataclass
class SummaryField:
    id: str
    label: str
    critical: bool
    values: list[SummaryValue] = field(default_factory=list)

    def add(self, text: str, location: str, limit: int = 8) -> None:
        text = text.strip()
        if not text or len(self.values) >= limit:
            return
        if any(v.text == text for v in self.values):
            return
        self.values.append(SummaryValue(text=text, location=location))


_NUM = r"[0-9][0-9,]*(?:\.[0-9]+)?"
CURRENCY_PATTERNS: list[tuple[str, str]] = [
    ("新臺幣", rf"(?:NT\$|NTD|TWD|新[臺台]幣)\s*({_NUM})"),
    ("美元", rf"(?:US\$|USD|美元|美金)\s*({_NUM})"),
    ("歐元", rf"(?:EUR|€|歐元)\s*({_NUM})"),
    ("日圓", rf"(?:JPY|日圓|日幣)\s*({_NUM})"),
    ("人民幣", rf"(?:CNY|RMB|人民幣)\s*({_NUM})"),
    ("英鎊", rf"(?:GBP|英鎊)\s*({_NUM})"),
]
_RE_REV_CURRENCY = re.compile(rf"({_NUM})\s*(美元|美金|歐元|日圓|日幣|人民幣|英鎊)")
_RE_GENERIC_YUAN = re.compile(rf"({_NUM})\s*元")
_RE_CN_AMOUNT = re.compile(rf"(?:新[臺台]幣)?\s*([{CN_NUM_CHARS}]{{3,}})\s*元")

_RE_ROC_DATE = re.compile(r"(?:中華)?民國\s*\d{1,3}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日")
_RE_AD_DATE = re.compile(r"(?:西元\s*)?(?:19|20)\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日")

_INCOTERMS = "EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DDU|DES|DEQ|C&F|CNF"
_RE_INCOTERM = re.compile(rf"\b({_INCOTERMS})\b")
_RE_INCOTERM_VER = re.compile(r"Incoterms?\s*®?\s*(20\d{2}|19\d{2})", re.IGNORECASE)

_RE_PARTY_COLON = re.compile(
    r"(甲方|乙方|買方|賣方|定作人|承攬人)\s*[：:]\s*([^\s（(，。;；：]{2,30})"
)
_RE_PARTY_ALIAS = re.compile(
    r"([^\s（(，。;；：]{2,30})\s*[（(]\s*以下簡稱\s*(甲方|乙方|買方|賣方|定作人|承攬人)\s*[)）]"
)

_SENTENCE_SPLIT = re.compile(r"[。；;]")
_SNIPPET_LEN = 80

# ── 金額語意分類 ─────────────────────────────────────────
# (regex, 分數)：分數高者優先視為合約金額
_CONTRACT_AMOUNT_KWS = [
    (r"契約總價|合約總價|契約金額|合約金額|訂購金額|採購金額|承攬報酬|承攬總價|工程總價|契約價金", 3),
    (r"總價|總金額|總計|價金", 2),
]
_RE_DEPOSIT = re.compile(r"定金|訂金|簽約金|頭期款")
_RE_BOND_KW = re.compile(r"履約保證|保證金")
_RE_LD_KW = re.compile(r"違約金|逾期罰|懲罰性|賠償金|[Ll]iquidated\s+[Dd]amages?|\bLD\b")

# ── LD 判讀 ─────────────────────────────────────────
_CN_SMALL = {"零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
             "六": 6, "七": 7, "八": 8, "九": 9}
_FRACTION = r"(千分之|萬分之|百分之)\s*([0-9]+(?:\.[0-9]+)?|[零一二三四五六七八九十]+)"
_RE_FRACTION = re.compile(rf"{_FRACTION}|([0-9]+(?:\.[0-9]+)?)\s*[%％]")
_RE_LD_PER = re.compile(r"每\s*逾?\s*([0-9一二三四五六七八九十]*)\s*(日|天|週|月)")
_RE_LD_BASE = re.compile(
    rf"[按依]\s*([^，。,]{{2,14}}?)\s*之?\s*(?={_FRACTION}|[0-9.]+\s*[%％])"
)
_RE_LD_CAP_WINDOW = re.compile(r"(?:上限|最高|不得超過|以)([^，。,]{0,20}?)為限|(?:上限|最高|不得超過)([^，。,]{0,20})")

# ── 付款／保固／期限判讀 ─────────────────────────────────────────
_RE_PAY_METHOD = re.compile(r"T/T|TT電匯|L/C|信用狀|電匯|匯款|即期支票|支票|現金|月結|票期")
_RE_PAY_TIMING = re.compile(
    r"(簽約|驗收合格|驗收|交貨|到貨|請款|收到發票|發票開立|完工|每月|次月)"
    r"[^，。,]{0,8}?([0-9０-９一二三四五六七八九十]+)\s*(?:個)?(日|天|月)內?"
)
_RE_INSTALLMENT = re.compile(r"分\s*([0-9一二三四五六七八九十]+)\s*期")
_RE_WARRANTY_DUR = re.compile(
    r"保固[^，。,]{0,12}?([0-9０-９一二三四五六七八九十]+)\s*(?:個)?(年|月|日|天)"
)
_RE_WARRANTY_START = re.compile(r"(驗收合格|驗收|交貨|到貨|完工|竣工|啟用)[^，。,]{0,6}?日?起")
_DEADLINE_KWS = [
    ("交貨期限", r"交貨|交期|到貨|交付"),
    ("完工期限", r"完工|竣工|工期"),
    ("驗收期限", r"驗收"),
]
_RE_REL_DEADLINE = re.compile(
    r"(?:(簽約|訂約|開工|訂購|下單|到貨|交貨|驗收合格|驗收|收到訂單)後?)?\s*"
    r"([0-9０-９一二三四五六七八九十]+)\s*(?:個)?(日|天|週|月)內"
)


def _cn_small_to_int(s: str) -> int | None:
    s = s.strip()
    if not s:
        return None
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", s):
        return int(float(s))
    if "十" in s:
        head, _, tail = s.partition("十")
        tens = _CN_SMALL.get(head, 1) if head else 1
        ones = _CN_SMALL.get(tail, 0) if tail else 0
        return tens * 10 + ones
    if len(s) == 1 and s in _CN_SMALL:
        return _CN_SMALL[s]
    return None


def _fraction_pct(m: re.Match) -> tuple[str, float | None]:
    """把 regex _RE_FRACTION 的命中換算為（原文, 百分比）。"""
    if m.group(3):  # 12% 形式
        return m.group(0).strip(), float(m.group(3))
    unit, num_str = m.group(1), m.group(2)
    num = _cn_small_to_int(num_str)
    if num is None:
        return m.group(0).strip(), None
    denom = {"千分之": 10, "萬分之": 100, "百分之": 1}[unit]
    return m.group(0).strip(), num / denom


@dataclass
class _AmountHit:
    rendered: str  # 例：新臺幣 1,000,000（大寫 壹佰貳拾萬元＝1,200,000）
    span: tuple[int, int]


def _amounts_in(text: str) -> list[_AmountHit]:
    """找出句中所有金額，鄰近的大寫／數字自動併成一筆。"""
    arabic: list[tuple[tuple[int, int], str]] = []  # (span, "幣別 數字")
    taken: list[tuple[int, int]] = []
    for label, pattern in CURRENCY_PATTERNS:
        for m in re.finditer(pattern, text):
            arabic.append((m.span(), f"{label} {m.group(1)}"))
            taken.append(m.span())
    for m in _RE_REV_CURRENCY.finditer(text):
        if not _overlaps(m.span(), taken):
            arabic.append((m.span(), f"{m.group(2)} {m.group(1)}"))
            taken.append(m.span())
    for m in _RE_GENERIC_YUAN.finditer(text):
        if not _overlaps(m.span(), taken):
            arabic.append((m.span(), f"{m.group(1)} 元"))
            taken.append(m.span())
    cn: list[tuple[tuple[int, int], str, int]] = []
    for m in _RE_CN_AMOUNT.finditer(text):
        cn.append((m.span(), m.group(1), cn_amount_to_int(m.group(1))))

    hits: list[_AmountHit] = []
    used_cn: set[int] = set()
    for span, rendered in sorted(arabic):
        note = ""
        for i, (cspan, ctext, cval) in enumerate(cn):
            if i in used_cn:
                continue
            gap = min(abs(span[0] - cspan[1]), abs(cspan[0] - span[1]))
            if gap <= 8:
                used_cn.add(i)
                digits = int(rendered.split()[-1].replace(",", "").split(".")[0])
                mark = "" if digits == cval else "，兩者不一致⚠"
                note = f"（大寫 {ctext}元＝{cval:,}{mark}）"
                span = (min(span[0], cspan[0]), max(span[1], cspan[1]))
                break
        hits.append(_AmountHit(rendered=rendered + note, span=span))
    for i, (cspan, ctext, cval) in enumerate(cn):
        if i not in used_cn:
            hits.append(_AmountHit(rendered=f"大寫 {ctext}元（＝{cval:,}）", span=cspan))
    hits.sort(key=lambda h: h.span)
    return hits


def _overlaps(span: tuple[int, int], taken: list[tuple[int, int]]) -> bool:
    return any(s < span[1] and span[0] < e for s, e in taken)


def _trim(text: str) -> str:
    return text if len(text) <= _SNIPPET_LEN else text[: _SNIPPET_LEN - 1] + "…"


def _sentences(segments: list[Segment]):
    for seg in segments:
        for sent in _SENTENCE_SPLIT.split(seg.text):
            sent = sent.strip()
            if sent:
                yield sent, seg.location


def _parse_ld(sent: str) -> str | None:
    """解析違約金句 → 判讀文字；解析不出費率/金額則回 None。"""
    rate = _RE_FRACTION.search(sent)
    parts: list[str] = []
    if rate:
        rate_text, pct = _fraction_pct(rate)
        per = _RE_LD_PER.search(sent)
        base = _RE_LD_BASE.search(sent)
        per_text = f"每{per.group(1) or '一'}{per.group(2)}" if per else "每期"
        base_text = base.group(1).strip() if base else "（計罰基準未明⚠）"
        pct_text = f"（≈{pct:g}％{'／' + per.group(2) if per else ''}）" if pct is not None else ""
        parts.append(f"{per_text}按 {base_text} 計 {rate_text}{pct_text}")
    else:
        amounts = _amounts_in(sent)
        if not amounts:
            return None
        parts.append("定額：" + "、".join(h.rendered for h in amounts[:2]))

    cap = None
    m = _RE_LD_CAP_WINDOW.search(sent)
    if m:
        window = m.group(1) or m.group(2) or ""
        cap_rate = _RE_FRACTION.search(window)
        if cap_rate:
            cap_text, cap_pct = _fraction_pct(cap_rate)
            cap = cap_text + (f"（≈{cap_pct:g}％）" if cap_pct is not None else "")
        elif window.strip():
            cap = window.strip()
    parts.append(f"上限：{cap}" if cap else "上限：未見約定⚠")
    return "；".join(parts)


def _parse_payment(sent: str) -> str | None:
    timing = _RE_PAY_TIMING.search(sent)
    methods = sorted(set(_RE_PAY_METHOD.findall(sent)))
    installment = _RE_INSTALLMENT.search(sent)
    parts = []
    if timing:
        parts.append(f"{timing.group(1)}後 {timing.group(2)} {timing.group(3)}內")
    if installment:
        parts.append(f"分 {installment.group(1)} 期")
    if methods:
        parts.append("方式：" + "、".join(methods))
    return "，".join(parts) if parts else None


def _parse_warranty(sent: str) -> str | None:
    dur = _RE_WARRANTY_DUR.search(sent)
    if not dur:
        return None
    start = _RE_WARRANTY_START.search(sent)
    start_text = f"（自{start.group(1)}日起算）" if start else ""
    return f"{dur.group(1)} {dur.group(2)}{start_text}"


def extract_summary(segments: list[Segment]) -> list[SummaryField]:
    parties = SummaryField("parties", "當事人", critical=False)
    contract_amount = SummaryField("contract_amount", "合約金額", critical=True)
    other_amounts = SummaryField("other_amounts", "其他金額", critical=False)
    sign_date = SummaryField("sign_date", "簽約日期", critical=True)
    deadlines = SummaryField("deadlines", "交貨／完工期限", critical=True)
    payment = SummaryField("payment", "付款條件", critical=True)
    incoterm = SummaryField("incoterm", "貿易條件（Incoterms）", critical=False)
    ld = SummaryField("ld", "違約金（LD）", critical=True)
    bond = SummaryField("bond", "履約保證金", critical=False)
    warranty = SummaryField("warranty", "保固", critical=False)

    # ── 段落層：當事人、Incoterms、簽約日期 ──
    for seg in segments:
        for m in _RE_PARTY_COLON.finditer(seg.text):
            parties.add(f"{m.group(1)}：{m.group(2)}", seg.location)
        for m in _RE_PARTY_ALIAS.finditer(seg.text):
            parties.add(f"{m.group(2)}：{m.group(1)}", seg.location)
        for m in _RE_INCOTERM.finditer(seg.text):
            incoterm.add(seg.text[m.start(): m.end() + 24].strip(), seg.location)
        ver = _RE_INCOTERM_VER.search(seg.text)
        if ver:
            incoterm.add(ver.group(0), seg.location)
        # 簽約日期：落款（整段只有日期）或含「簽約／簽訂／立約」的日期
        date_m = _RE_ROC_DATE.search(seg.text) or _RE_AD_DATE.search(seg.text)
        if date_m:
            stripped = seg.text.replace("　", "").replace(" ", "")
            if stripped == date_m.group(0).replace(" ", "") or re.search(
                r"簽約|簽訂|立約|訂約", seg.text
            ):
                sign_date.add(date_m.group(0), seg.location, limit=2)

    # ── 句子層：金額分類、LD、付款、保證金、保固、期限 ──
    contract_candidates: list[tuple[int, int, str, str]] = []  # (-score, 序, 文字, 位置)
    order = 0
    for sent, location in _sentences(segments):
        order += 1
        hits = _amounts_in(sent)
        is_ld = bool(_RE_LD_KW.search(sent))
        is_bond = bool(_RE_BOND_KW.search(sent))
        is_deposit = bool(_RE_DEPOSIT.search(sent))

        if hits and not is_ld:
            rendered = "、".join(h.rendered for h in hits[:3])
            score = 0
            for pattern, s in _CONTRACT_AMOUNT_KWS:
                if re.search(pattern, sent):
                    score = max(score, s)
            if is_deposit:
                other_amounts.add(f"定金：{rendered}", location)
            elif is_bond:
                other_amounts.add(f"履約保證金：{rendered}", location)
            elif score:
                contract_candidates.append((-score, order, rendered, location))
            else:
                other_amounts.add(f"其他：{rendered}", location)

        if is_ld:
            parsed = _parse_ld(sent)
            if parsed:
                ld.add(parsed, location)
                ld.add(f"原文：{_trim(sent)}", location)
            else:
                ld.add(_trim(sent), location)

        if is_bond:
            pct = _RE_FRACTION.search(sent)
            if pct and not hits:
                text, value = _fraction_pct(pct)
                bond.add(text + (f"（≈{value:g}％）" if value is not None else ""), location)
            elif hits:
                bond.add("、".join(h.rendered for h in hits[:2]), location)
            else:
                bond.add(_trim(sent), location)

        if re.search(r"付款|支付|給付價金|價金給付|T/T|L/C|信用狀|電匯|月結|票期", sent):
            parsed = _parse_payment(sent)
            payment.add(parsed if parsed else _trim(sent), location)

        if re.search(r"保固|瑕疵擔保", sent):
            parsed = _parse_warranty(sent)
            if parsed:
                warranty.add(parsed, location)

        # 期限分類取「最後命中」的關鍵字：如「到貨後七日內完成驗收」的期限
        # 動作是驗收不是到貨；付款句（驗收後30日內支付）不屬期限欄
        if not is_ld and not re.search(r"付款|支付|給付", sent):
            best_label, best_pos = None, -1
            for label, kws in _DEADLINE_KWS:
                for m in re.finditer(kws, sent):
                    if m.start() > best_pos:
                        best_label, best_pos = label, m.start()
            if best_label:
                date_m = _RE_ROC_DATE.search(sent) or _RE_AD_DATE.search(sent)
                rel = _RE_REL_DEADLINE.search(sent)
                if date_m:
                    deadlines.add(f"{best_label}：{date_m.group(0)} 前", location)
                elif rel:
                    ref = f"{rel.group(1)}後 " if rel.group(1) else ""
                    deadlines.add(
                        f"{best_label}：{ref}{rel.group(2)} {rel.group(3)}內", location
                    )

    if contract_candidates:
        contract_candidates.sort()
        best = contract_candidates[0]
        contract_amount.add(best[2], best[3])
        # 其餘候選降級為其他金額
        for _, _, rendered, location in contract_candidates[1:]:
            other_amounts.add(f"其他：{rendered}", location)

    return [
        parties, contract_amount, other_amounts, sign_date, deadlines,
        payment, incoterm, ld, bond, warranty,
    ]
