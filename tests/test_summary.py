"""商務摘要判讀測試：python -m unittest discover tests"""

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from contract_review.extract import Segment  # noqa: E402
from contract_review.summary import extract_summary  # noqa: E402


def _summary(*texts):
    segments = [Segment(text=t, location=f"段落 {i+1}") for i, t in enumerate(texts)]
    return {fld.id: fld for fld in extract_summary(segments)}


class TestContractAmount(unittest.TestCase):
    def test_picks_contract_total_not_deposit(self):
        s = _summary(
            "第二條　契約總價：新臺幣壹佰萬元整（NT$1,000,000元）。",
            "第六條　定金：甲方於簽約時給付定金新臺幣貳拾萬元整。",
            "第七條　違約金：乙方逾期者按日計罰新臺幣5,000元。",
        )
        self.assertEqual(len(s["contract_amount"].values), 1)
        self.assertIn("1,000,000", s["contract_amount"].values[0].text)
        others = " / ".join(v.text for v in s["other_amounts"].values)
        self.assertIn("定金：", others)
        self.assertNotIn("5,000", others)  # 違約金額歸 LD，不進其他金額

    def test_paired_cn_arabic_merged(self):
        s = _summary("契約總價：新臺幣壹佰貳拾萬元整（NT$1,000,000元）。")
        text = s["contract_amount"].values[0].text
        self.assertIn("新臺幣 1,000,000", text)
        self.assertIn("壹佰貳拾萬", text)
        self.assertIn("不一致⚠", text)

    def test_stronger_keyword_wins(self):
        s = _summary(
            "運費總計 3,000 元。",
            "合約金額為 USD 50,000。",
        )
        self.assertIn("美元 50,000", s["contract_amount"].values[0].text)

    def test_missing_is_critical(self):
        s = _summary("本合約無金額。")
        self.assertTrue(s["contract_amount"].critical)
        self.assertEqual(s["contract_amount"].values, [])


class TestLd(unittest.TestCase):
    def test_rate_base_and_missing_cap(self):
        s = _summary("乙方逾期交貨者，每逾一日按契約總價千分之一計罰違約金。")
        text = s["ld"].values[0].text
        self.assertIn("每一日", text)
        self.assertIn("契約總價", text)
        self.assertIn("千分之一", text)
        self.assertIn("0.1％", text)
        self.assertIn("上限：未見約定⚠", text)

    def test_cap_parsed(self):
        s = _summary("每逾一日按契約總價千分之三計罰違約金，最高以契約總價百分之十為限。")
        text = s["ld"].values[0].text
        self.assertIn("0.3％", text)
        self.assertIn("上限：", text)
        self.assertIn("10％", text)
        self.assertNotIn("未見約定", text)

    def test_fixed_amount_ld(self):
        s = _summary("乙方逾期者，違約金為每日新臺幣5,000元。")
        text = s["ld"].values[0].text
        self.assertIn("定額", text)
        self.assertIn("5,000", text)

    def test_percent_rate(self):
        s = _summary("Liquidated damages: 0.5% of contract price per week, capped at 10%.")
        text = s["ld"].values[0].text
        self.assertIn("0.5", text)


class TestPayment(unittest.TestCase):
    def test_timing_and_method(self):
        s = _summary("付款條件：甲方應於驗收合格後30日內以電匯支付。")
        text = s["payment"].values[0].text
        self.assertIn("驗收合格後 30 日內", text)
        self.assertIn("電匯", text)

    def test_fallback_to_sentence(self):
        s = _summary("付款條件依雙方另行議定之附件辦理。")
        self.assertIn("付款條件依雙方另行議定", s["payment"].values[0].text)


class TestWarrantyAndBond(unittest.TestCase):
    def test_warranty_duration_and_start(self):
        s = _summary("乙方保固期間為驗收合格日起一年。")
        text = s["warranty"].values[0].text
        self.assertIn("一 年", text)
        self.assertIn("驗收合格", text)

    def test_bond_percent(self):
        s = _summary("乙方應繳納契約總價百分之十之履約保證金。")
        self.assertIn("10％", s["bond"].values[0].text)


class TestSignDateAndDeadline(unittest.TestCase):
    def test_sign_date_from_footer(self):
        s = _summary("第一條　內容。", "立契約書人　甲方：Ａ公司", "中華民國115年1月15日")
        self.assertEqual(len(s["sign_date"].values), 1)
        self.assertIn("115年1月15日", s["sign_date"].values[0].text)

    def test_deadline_date_and_relative(self):
        s = _summary(
            "乙方應於民國115年6月30日前交貨。",
            "甲方應於到貨後七日內完成驗收。",
        )
        texts = [v.text for v in s["deadlines"].values]
        self.assertIn("交貨期限：民國115年6月30日 前", texts)
        self.assertIn("驗收期限：到貨後 七 日內", texts)

    def test_body_date_not_sign_date(self):
        s = _summary("乙方應於民國115年6月30日前交貨。")
        self.assertEqual(s["sign_date"].values, [])


class TestOtherFields(unittest.TestCase):
    def test_parties(self):
        s = _summary("大甲精機股份有限公司（以下簡稱甲方）", "乙方：永信工業有限公司")
        texts = [v.text for v in s["parties"].values]
        self.assertIn("甲方：大甲精機股份有限公司", texts)
        self.assertIn("乙方：永信工業有限公司", texts)

    def test_incoterm(self):
        s = _summary("依 FOB Keelung（Incoterms 2020）條件交貨。")
        joined = " / ".join(v.text for v in s["incoterm"].values)
        self.assertIn("FOB Keelung", joined)
        self.assertIn("Incoterms 2020", joined)


if __name__ == "__main__":
    unittest.main()
