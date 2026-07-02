"""內建智慧檢查：金額大小寫比對、日期合理性、空白欄位、稱謂一致性。

這些檢查需要程式邏輯，無法只用 regex 表達，故以 builtin 規則型別掛入
規則引擎（rules/*.yaml 中 type: builtin, check: <名稱>）。
"""

from __future__ import annotations

import calendar
import re

from .extract import Segment
from .findings import Finding

CN_DIGITS = {
    "零": 0, "壹": 1, "貳": 2, "參": 3, "叁": 3, "参": 3,
    "肆": 4, "伍": 5, "陸": 6, "柒": 7, "捌": 8, "玖": 9,
}
CN_UNITS = {"拾": 10, "佰": 100, "仟": 1000}
CN_SECTIONS = {"萬": 10**4, "億": 10**8, "兆": 10**12}
CN_NUM_CHARS = "".join(CN_DIGITS) + "".join(CN_UNITS) + "".join(CN_SECTIONS)


def cn_amount_to_int(text: str) -> int:
    """將中文大寫金額（如 壹佰貳拾萬）轉為整數。"""
    total = 0
    section = 0
    current = 0
    for ch in text:
        if ch in CN_DIGITS:
            current = CN_DIGITS[ch]
        elif ch in CN_UNITS:
            section += (current or 1) * CN_UNITS[ch]
            current = 0
        elif ch in CN_SECTIONS:
            section = (section + current) * CN_SECTIONS[ch]
            total += section
            section = 0
            current = 0
    return total + section + current


# 中文大寫金額後緊鄰括號內的阿拉伯數字金額，例：新臺幣壹佰萬元整（NT$1,000,000元）
_RE_CN_THEN_ARABIC = re.compile(
    rf"[新]?[臺台]?幣?\s*([{CN_NUM_CHARS}]{{2,}})\s*元整?"
    r"[^（()）0-9]{0,6}"
    r"[（(]\s*(?:NT\$|新[臺台]幣)?\s*([0-9][0-9,]*)\s*元?整?\s*[)）]"
)
# 阿拉伯數字金額後緊鄰括號內的中文大寫金額，例：NT$1,000,000（壹佰萬元整）
_RE_ARABIC_THEN_CN = re.compile(
    rf"(?:NT\$|新[臺台]幣)\s*([0-9][0-9,]*)\s*元?整?"
    r"[^（()）]{0,6}"
    rf"[（(]\s*(?:新[臺台]幣)?\s*([{CN_NUM_CHARS}]{{2,}})\s*元整?\s*[)）]"
)


def check_amount_consistency(segments: list[Segment], rule) -> list[Finding]:
    """比對同一處並列的中文大寫金額與阿拉伯數字金額是否一致。"""
    findings = []
    for seg in segments:
        pairs = []
        for m in _RE_CN_THEN_ARABIC.finditer(seg.text):
            pairs.append((m.group(1), m.group(2), m.group(0)))
        for m in _RE_ARABIC_THEN_CN.finditer(seg.text):
            pairs.append((m.group(2), m.group(1), m.group(0)))
        for cn_text, arabic_text, matched in pairs:
            cn_value = cn_amount_to_int(cn_text)
            arabic_value = int(arabic_text.replace(",", ""))
            if cn_value != arabic_value:
                findings.append(
                    Finding(
                        rule_id=rule.id,
                        severity=rule.severity,
                        message=(
                            f"金額大小寫不一致：大寫「{cn_text}」＝{cn_value:,} 元，"
                            f"數字為 {arabic_value:,} 元。"
                        ),
                        location=seg.location,
                        snippet=matched,
                    )
                )
    return findings


_RE_ROC_DATE = re.compile(
    r"(?:中華)?民國\s*(\d{1,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日"
)
_RE_AD_DATE = re.compile(r"(?:西元\s*)?((?:19|20)\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")


def check_date_validity(segments: list[Segment], rule) -> list[Finding]:
    """檢查民國／西元日期是否為有效日期（如 2 月 30 日、13 月）。"""
    findings = []
    for seg in segments:
        seen_spans = []
        for m in _RE_ROC_DATE.finditer(seg.text):
            seen_spans.append(m.span())
            year = int(m.group(1)) + 1911
            _validate_date(findings, seg, rule, m.group(0), year, int(m.group(2)), int(m.group(3)))
        for m in _RE_AD_DATE.finditer(seg.text):
            # 避免與民國日期重覆比對（民國 regex 已含年月日）
            if any(s <= m.start() and m.end() <= e for s, e in seen_spans):
                continue
            _validate_date(
                findings, seg, rule, m.group(0), int(m.group(1)), int(m.group(2)), int(m.group(3))
            )
    return findings


def _validate_date(findings, seg, rule, matched, year, month, day):
    valid = 1 <= month <= 12 and 1 <= day <= calendar.monthrange(year, month)[1]
    if not valid:
        findings.append(
            Finding(
                rule_id=rule.id,
                severity=rule.severity,
                message=f"無效日期：「{matched}」不是存在的日期，請勘誤。",
                location=seg.location,
                snippet=matched,
            )
        )


# 空欄樣式：底線、勾選框、以及緊鄰單位（元/年/月/日/%）或冒號後的全形空白。
# 全形空白常用於排版縮排，只有在這些高風險位置才視為未填寫，避免誤報。
_RE_BLANK_UNDERLINE = re.compile(r"[_＿]{2,}")
_RE_BLANK_BOX = re.compile(r"□")
_RE_BLANK_FW_SPACE = re.compile(r"(?:：\s*[　]{2,})|(?:[　]{2,}\s*(?=[元年月日%％]))")


def check_blank_fields(segments: list[Segment], rule) -> list[Finding]:
    """找出疑似未填寫的空白欄位（底線、空白緊鄰金額日期單位等）。"""
    findings = []
    for seg in segments:
        hits = []
        hits += [m.group(0) for m in _RE_BLANK_UNDERLINE.finditer(seg.text)]
        hits += [m.group(0) for m in _RE_BLANK_FW_SPACE.finditer(seg.text)]
        if _RE_BLANK_BOX.search(seg.text) and "■" not in seg.text and "☑" not in seg.text:
            hits.append("□（勾選框皆未勾選）")
        if hits:
            findings.append(
                Finding(
                    rule_id=rule.id,
                    severity=rule.severity,
                    message=f"疑似未填寫欄位（{len(hits)} 處），請確認是否漏填。",
                    location=seg.location,
                    snippet=seg.text[:60],
                )
            )
    return findings


BUILTIN_CHECKS = {
    "amount_consistency": check_amount_consistency,
    "date_validity": check_date_validity,
    "blank_fields": check_blank_fields,
}
