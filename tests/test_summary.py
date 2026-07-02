"""商務摘要擷取測試：python -m unittest discover tests"""

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


class TestAmounts(unittest.TestCase):
    def test_currency_labels(self):
        fld = _summary("契約總價 NT$1,200,000，其中進口件 USD 35,000，另 EUR 500。")["amounts"]
        texts = [v.text for v in fld.values]
        self.assertIn("新臺幣 1,200,000", texts)
        self.assertIn("美元 35,000", texts)
        self.assertIn("歐元 500", texts)

    def test_reversed_currency(self):
        fld = _summary("價金 35,000 美元整。")["amounts"]
        self.assertEqual(fld.values[0].text, "美元 35,000")

    def test_cn_amount_converted(self):
        fld = _summary("新臺幣壹佰貳拾萬元整。")["amounts"]
        self.assertIn("＝1,200,000", fld.values[0].text)

    def test_generic_yuan_not_double_counted(self):
        fld = _summary("總價新臺幣 500,000 元。")["amounts"]
        self.assertEqual(len(fld.values), 1)
        self.assertEqual(fld.values[0].text, "新臺幣 500,000")

    def test_critical_flag(self):
        summary = _summary("本契約無金額資訊。")
        self.assertTrue(summary["amounts"].critical)
        self.assertEqual(summary["amounts"].values, [])


class TestDates(unittest.TestCase):
    def test_roc_and_ad(self):
        fld = _summary("民國115年1月15日簽約，效期至2027年12月31日。")["dates"]
        texts = [v.text for v in fld.values]
        self.assertEqual(len(texts), 2)
        self.assertIn("民國115年1月15日", texts)

    def test_roc_not_duplicated_as_ad(self):
        fld = _summary("民國115年1月15日")["dates"]
        self.assertEqual(len(fld.values), 1)


class TestIncoterm(unittest.TestCase):
    def test_term_and_version(self):
        fld = _summary("依 FOB Keelung（Incoterms 2020）條件交貨。")["incoterm"]
        texts = " / ".join(v.text for v in fld.values)
        self.assertIn("FOB Keelung", texts)
        self.assertIn("Incoterms 2020", texts)

    def test_no_false_positive_in_words(self):
        # 小寫或詞中出現不算（\b 邊界 + 大寫）
        fld = _summary("双方同意 cifra 一詞無關。")["incoterm"]
        self.assertEqual(fld.values, [])


class TestLd(unittest.TestCase):
    def test_ld_sentence(self):
        fld = _summary("乙方逾期交貨者，每逾一日按契約總價千分之一計罰違約金，上限為契約總價百分之十。")["ld"]
        self.assertEqual(len(fld.values), 1)
        self.assertIn("千分之一", fld.values[0].text)
        self.assertTrue(fld.critical)

    def test_english_ld(self):
        fld = _summary("Liquidated damages shall be 0.1% per day.")["ld"]
        self.assertEqual(len(fld.values), 1)


class TestOtherFields(unittest.TestCase):
    def test_parties(self):
        fld = _summary(
            "大甲精機股份有限公司（以下簡稱甲方）",
            "乙方：永信工業有限公司",
        )["parties"]
        texts = [v.text for v in fld.values]
        self.assertIn("甲方：大甲精機股份有限公司", texts)
        self.assertIn("乙方：永信工業有限公司", texts)

    def test_deadline_needs_time(self):
        summary = _summary("乙方應於民國115年6月30日前交貨", "交貨地點為甲方工廠")
        texts = [v.text for v in summary["deadlines"].values]
        self.assertEqual(len(texts), 1)
        self.assertIn("交貨", texts[0])

    def test_payment_and_warranty(self):
        summary = _summary("付款方式：驗收後 30 日內以 T/T 電匯支付", "保固期間為一年")
        self.assertEqual(len(summary["payment"].values), 1)
        self.assertEqual(len(summary["warranty"].values), 1)


if __name__ == "__main__":
    unittest.main()
