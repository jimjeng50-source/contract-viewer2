"""單元測試：python -m unittest discover tests"""

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from contract_review.checks import (  # noqa: E402
    check_amount_consistency,
    check_blank_fields,
    check_date_validity,
    cn_amount_to_int,
)
from contract_review.engine import detect_doc_type  # noqa: E402
from contract_review.extract import Segment  # noqa: E402
from contract_review.rules import Rule, load_rules_for, run_rules  # noqa: E402


def _rule(rule_id="t", severity="error"):
    return Rule(id=rule_id, type="builtin", severity=severity)


def _seg(text):
    return [Segment(text=text, location="測試")]


class TestCnAmount(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(cn_amount_to_int("壹佰萬"), 1_000_000)
        self.assertEqual(cn_amount_to_int("壹佰貳拾萬"), 1_200_000)
        self.assertEqual(cn_amount_to_int("參佰零伍萬肆仟"), 3_054_000)
        self.assertEqual(cn_amount_to_int("壹億貳仟萬"), 120_000_000)
        self.assertEqual(cn_amount_to_int("拾萬"), 100_000)
        self.assertEqual(cn_amount_to_int("玖仟捌佰柒拾陸"), 9876)

    def test_variant_chars(self):
        self.assertEqual(cn_amount_to_int("叁佰萬"), 3_000_000)
        self.assertEqual(cn_amount_to_int("参佰萬"), 3_000_000)


class TestAmountConsistency(unittest.TestCase):
    def test_mismatch_flagged(self):
        segs = _seg("契約總價：新臺幣壹佰貳拾萬元整（NT$1,000,000元）。")
        findings = check_amount_consistency(segs, _rule())
        self.assertEqual(len(findings), 1)
        self.assertIn("1,200,000", findings[0].message)

    def test_match_ok(self):
        segs = _seg("契約總價：新臺幣壹佰萬元整（NT$1,000,000元）。")
        self.assertEqual(check_amount_consistency(segs, _rule()), [])

    def test_arabic_first(self):
        segs = _seg("總價 NT$3,000,000（新臺幣參佰萬元整）。")
        self.assertEqual(check_amount_consistency(segs, _rule()), [])
        segs = _seg("總價 NT$3,500,000（新臺幣參佰萬元整）。")
        self.assertEqual(len(check_amount_consistency(segs, _rule())), 1)


class TestDateValidity(unittest.TestCase):
    def test_invalid_roc_date(self):
        findings = check_date_validity(_seg("應於民國115年2月30日前交貨。"), _rule())
        self.assertEqual(len(findings), 1)

    def test_valid_dates(self):
        segs = _seg("民國115年2月28日簽約，西元2026年3月1日生效。")
        self.assertEqual(check_date_validity(segs, _rule()), [])

    def test_invalid_month(self):
        findings = check_date_validity(_seg("2026年13月1日"), _rule())
        self.assertEqual(len(findings), 1)


class TestBlankFields(unittest.TestCase):
    def test_underline(self):
        findings = check_blank_fields(_seg("帳號：______________"), _rule())
        self.assertEqual(len(findings), 1)

    def test_fullwidth_underscore(self):
        findings = check_blank_fields(_seg("於民國＿＿年＿＿月＿＿日前竣工"), _rule())
        self.assertEqual(len(findings), 1)

    def test_fullwidth_space_before_unit(self):
        findings = check_blank_fields(_seg("驗收合格後　　日內付款"), _rule())
        self.assertEqual(len(findings), 1)

    def test_indent_not_flagged(self):
        # 全形空白縮排（非緊鄰單位）不應誤報
        findings = check_blank_fields(_seg("　　　　永信工業有限公司（以下簡稱乙方）"), _rule())
        self.assertEqual(findings, [])

    def test_checked_box_not_flagged(self):
        self.assertEqual(check_blank_fields(_seg("付款方式：■電匯　□支票"), _rule()), [])
        self.assertEqual(len(check_blank_fields(_seg("付款方式：□電匯　□支票"), _rule())), 1)


class TestRulesEngine(unittest.TestCase):
    def test_load_default_rules(self):
        rules = load_rules_for("purchase_order", REPO / "rules")
        ids = {r.id for r in rules}
        self.assertIn("common-amount-consistency", ids)
        self.assertIn("po-payment", ids)
        self.assertNotIn("sub-warranty", ids)

    def test_required_missing(self):
        rules = [Rule(id="r1", type="required", severity="error", patterns=["保固"])]
        findings = run_rules(rules, _seg("本契約無相關內容"))
        self.assertEqual(len(findings), 1)
        findings = run_rules(rules, _seg("保固期間一年"))
        self.assertEqual(findings, [])

    def test_forbidden(self):
        rules = [Rule(id="r2", type="forbidden", severity="warning", patterns=["訂金"])]
        self.assertEqual(len(run_rules(rules, _seg("簽約時給付訂金"))), 1)
        self.assertEqual(run_rules(rules, _seg("簽約時給付定金")), [])

    def test_consistency(self):
        rules = [
            Rule(
                id="r3", type="consistency", severity="warning",
                groups=[["甲方", "乙方"], ["買方", "賣方"]],
            )
        ]
        self.assertEqual(len(run_rules(rules, _seg("甲方應向賣方付款"))), 1)
        self.assertEqual(run_rules(rules, _seg("甲方應向乙方付款")), [])

    def test_consistency_ignores_definition_lines(self):
        # 「定作人：Ｘ（以下簡稱甲方）」為標準定義寫法，不應判為混用
        rules = [
            Rule(
                id="r4", type="consistency", severity="warning",
                groups=[["甲方", "乙方"], ["定作人", "承攬人"]],
            )
        ]
        segs = [
            Segment(text="定作人：宏遠營造股份有限公司（以下簡稱甲方）", location="1"),
            Segment(text="甲方應按月給付乙方工程款。", location="2"),
        ]
        self.assertEqual(run_rules(rules, segs), [])


class TestDetect(unittest.TestCase):
    def test_detect(self):
        self.assertEqual(detect_doc_type("發包承攬契約書"), "subcontract")
        self.assertEqual(detect_doc_type("訂購單合約"), "purchase_order")
        self.assertEqual(detect_doc_type("保密協議"), "common")


if __name__ == "__main__":
    unittest.main()
