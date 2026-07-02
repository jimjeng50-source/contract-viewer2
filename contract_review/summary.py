"""商務摘要擷取：審查前先抓出合約的重要商務基本資訊。

擷取項目：當事人、幣別金額、日期、重要期限、付款條件、Incoterms 貿易條件、
違約金（LD）、履約保證金、保固。critical 項目擷取不到時前端會標示警告。

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


_NUM = r"[0-9][0-9,]*(?:\.[0-9]+)?"
CURRENCY_PATTERNS: list[tuple[str, str]] = [
    ("新臺幣", rf"(?:NT\$|NTD|TWD|新[臺台]幣)\s*({_NUM})"),
    ("美元", rf"(?:US\$|USD|美元|美金)\s*({_NUM})"),
    ("歐元", rf"(?:EUR|€|歐元)\s*({_NUM})"),
    ("日圓", rf"(?:JPY|日圓|日幣)\s*({_NUM})"),
    ("人民幣", rf"(?:CNY|RMB|人民幣)\s*({_NUM})"),
    ("英鎊", rf"(?:GBP|英鎊)\s*({_NUM})"),
]
_RE_GENERIC_YUAN = re.compile(rf"({_NUM})\s*元")
_RE_CN_AMOUNT = re.compile(rf"(?:新[臺台]幣)?\s*([{CN_NUM_CHARS}]{{3,}})\s*元")
_RE_REV_CURRENCY = re.compile(rf"({_NUM})\s*(美元|美金|歐元|日圓|日幣|人民幣|英鎊)")

_RE_ROC_DATE = re.compile(r"(?:中華)?民國\s*\d{1,3}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日")
_RE_AD_DATE = re.compile(r"(?:西元\s*)?(?:19|20)\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日")

_INCOTERMS = (
    "EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DDU|DES|DEQ|C&F|CNF"
)
_RE_INCOTERM = re.compile(rf"\b({_INCOTERMS})\b")
_RE_INCOTERM_VER = re.compile(r"Incoterms?\s*®?\s*(20\d{2}|19\d{2})", re.IGNORECASE)

_RE_PARTY_COLON = re.compile(
    r"(甲方|乙方|買方|賣方|定作人|承攬人)\s*[：:]\s*([^\s（(，。;；：]{2,30})"
)
_RE_PARTY_ALIAS = re.compile(
    r"([^\s（(，。;；：]{2,30})\s*[（(]\s*以下簡稱\s*(甲方|乙方|買方|賣方|定作人|承攬人)\s*[)）]"
)

_RE_DURATION = re.compile(r"[0-9０-９一二三四五六七八九十百]+\s*(?:個)?\s*(?:日|天|週|月|年)")

_SENTENCE_SPLIT = re.compile(r"[。；;]")

# (欄位id, 標題, critical, 句子關鍵字 regex)
_SENTENCE_FIELDS = [
    ("deadlines", "重要期限", True, r"交貨|交期|完工|竣工|工期|到貨|交付期限|有效期"),
    ("payment", "付款條件", True, r"付款|支付|給付價金|價金給付|T/T|L/C|信用狀|電匯|月結|票期|[Nn]et\s*\d+"),
    ("ld", "違約金（LD）", True, r"違約金|逾期罰|懲罰性|賠償金|[Ll]iquidated\s+[Dd]amages?|\bLD\b"),
    ("bond", "履約保證金", False, r"履約保證|保證金"),
    ("warranty", "保固", False, r"保固|瑕疵擔保"),
]

_MAX_VALUES = 8
_SNIPPET_LEN = 80


def _add(fld: SummaryField, text: str, location: str) -> None:
    text = text.strip()
    if not text or len(fld.values) >= _MAX_VALUES:
        return
    if any(v.text == text for v in fld.values):
        return
    fld.values.append(SummaryValue(text=text, location=location))


def _sentences(segments: list[Segment]):
    for seg in segments:
        for sent in _SENTENCE_SPLIT.split(seg.text):
            sent = sent.strip()
            if sent:
                yield sent, seg.location


def extract_summary(segments: list[Segment]) -> list[SummaryField]:
    parties = SummaryField("parties", "當事人", critical=False)
    amounts = SummaryField("amounts", "幣別金額", critical=True)
    dates = SummaryField("dates", "日期", critical=True)
    incoterm = SummaryField("incoterm", "貿易條件（Incoterms）", critical=False)
    sentence_fields = {
        fid: SummaryField(fid, label, critical, )
        for fid, label, critical, _ in _SENTENCE_FIELDS
    }

    for seg in segments:
        # 當事人
        for m in _RE_PARTY_COLON.finditer(seg.text):
            _add(parties, f"{m.group(1)}：{m.group(2)}", seg.location)
        for m in _RE_PARTY_ALIAS.finditer(seg.text):
            _add(parties, f"{m.group(2)}：{m.group(1)}", seg.location)

        # 幣別金額（記錄已命中的範圍，避免通用「元」重複擷取）
        taken: list[tuple[int, int]] = []
        for label, pattern in CURRENCY_PATTERNS:
            for m in re.finditer(pattern, seg.text):
                taken.append(m.span())
                _add(amounts, f"{label} {m.group(1)}", seg.location)
        for m in _RE_REV_CURRENCY.finditer(seg.text):
            if not _overlaps(m.span(), taken):
                taken.append(m.span())
                _add(amounts, f"{m.group(2)} {m.group(1)}", seg.location)
        for m in _RE_CN_AMOUNT.finditer(seg.text):
            taken.append(m.span())
            value = cn_amount_to_int(m.group(1))
            _add(amounts, f"大寫 {m.group(1)}元（＝{value:,}）", seg.location)
        for m in _RE_GENERIC_YUAN.finditer(seg.text):
            if not _overlaps(m.span(), taken):
                _add(amounts, f"{m.group(1)} 元（未標幣別）", seg.location)

        # 日期
        spans: list[tuple[int, int]] = []
        for m in _RE_ROC_DATE.finditer(seg.text):
            spans.append(m.span())
            _add(dates, m.group(0), seg.location)
        for m in _RE_AD_DATE.finditer(seg.text):
            if not _overlaps(m.span(), spans):
                _add(dates, m.group(0), seg.location)

        # Incoterms：條件 ＋ 前後文
        for m in _RE_INCOTERM.finditer(seg.text):
            context = seg.text[m.start(): m.end() + 24].strip()
            _add(incoterm, context, seg.location)
        ver = _RE_INCOTERM_VER.search(seg.text)
        if ver:
            _add(incoterm, ver.group(0), seg.location)

    # 句子型欄位（期限／付款／LD／保證金／保固）
    for sent, location in _sentences(segments):
        for fid, _, _, keywords in _SENTENCE_FIELDS:
            if re.search(keywords, sent):
                if fid == "deadlines" and not (
                    _RE_DURATION.search(sent)
                    or _RE_ROC_DATE.search(sent)
                    or _RE_AD_DATE.search(sent)
                ):
                    continue  # 期限欄只收有具體時間的句子
                _add(sentence_fields[fid], _trim(sent), location)

    return [
        parties, amounts, dates,
        sentence_fields["deadlines"], sentence_fields["payment"], incoterm,
        sentence_fields["ld"], sentence_fields["bond"], sentence_fields["warranty"],
    ]


def _overlaps(span: tuple[int, int], taken: list[tuple[int, int]]) -> bool:
    return any(s < span[1] and span[0] < e for s, e in taken)


def _trim(text: str) -> str:
    return text if len(text) <= _SNIPPET_LEN else text[: _SNIPPET_LEN - 1] + "…"
