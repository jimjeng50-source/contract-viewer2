"""學習功能與網頁 API 測試：python -m unittest discover tests"""

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from contract_review.findings import Finding  # noqa: E402
from contract_review.learning import (  # noqa: E402
    apply_suppressions,
    extend_rule_patterns,
    learning_stats,
    record_feedback,
)


class TempDirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)


class TestSuppression(TempDirTest):
    def _finding(self):
        return Finding(
            rule_id="common-blank-fields", severity="warning",
            message="疑似未填寫欄位", location="段落 3",
            snippet="────裝訂線────",
        )

    def test_false_positive_suppressed_on_next_review(self):
        f = self._finding()
        outcome = record_feedback(
            "false_positive",
            {"rule_id": f.rule_id, "snippet": f.snippet, "location": f.location},
            learning_dir=self.tmp,
        )
        self.assertEqual(outcome["action"], "suppressed")
        kept, suppressed = apply_suppressions([f], self.tmp)
        self.assertEqual(kept, [])
        self.assertEqual(suppressed, 1)

    def test_snippet_whitespace_insensitive(self):
        record_feedback(
            "false_positive",
            {"rule_id": "r", "snippet": "驗收 合格　後"},
            learning_dir=self.tmp,
        )
        f = Finding(rule_id="r", severity="info", message="", snippet="驗收合格後")
        kept, suppressed = apply_suppressions([f], self.tmp)
        self.assertEqual(suppressed, 1)

    def test_confirmed_not_suppressed(self):
        f = self._finding()
        outcome = record_feedback(
            "confirmed",
            {"rule_id": f.rule_id, "snippet": f.snippet},
            learning_dir=self.tmp,
        )
        self.assertEqual(outcome["action"], "logged")
        kept, suppressed = apply_suppressions([f], self.tmp)
        self.assertEqual(len(kept), 1)

    def test_stats(self):
        record_feedback("false_positive", {"rule_id": "a", "snippet": "x"},
                        learning_dir=self.tmp)
        record_feedback("confirmed", {"rule_id": "a", "snippet": "y"},
                        learning_dir=self.tmp)
        stats = learning_stats(self.tmp)
        self.assertEqual(stats["feedback_count"], 2)
        self.assertEqual(stats["suppression_count"], 1)
        self.assertEqual(stats["per_rule"]["a"]["false_positive"], 1)


class TestExtendRule(TempDirTest):
    def setUp(self):
        super().setUp()
        (self.tmp / "rules").mkdir()
        (self.tmp / "rules" / "t.yaml").write_text(
            "doc_type: common\nrules:\n"
            "  - id: t-warranty\n    type: required\n    severity: warning\n"
            "    patterns: [\"保固\"]\n",
            encoding="utf-8",
        )

    def test_extend_required_rule(self):
        extend_rule_patterns("t-warranty", "品質保證", self.tmp / "rules")
        text = (self.tmp / "rules" / "t.yaml").read_text(encoding="utf-8")
        self.assertIn("品質保證", text)

    def test_unknown_rule(self):
        with self.assertRaises(ValueError):
            extend_rule_patterns("nope", "x", self.tmp / "rules")

    def test_invalid_regex(self):
        with self.assertRaises(ValueError):
            extend_rule_patterns("t-warranty", "([", self.tmp / "rules")


class TestWebApp(TempDirTest):
    def setUp(self):
        super().setUp()
        from contract_review.webapp import create_app

        self.learning = self.tmp / "learning"
        self.app = create_app(rules_dir=REPO / "rules", learning_dir=self.learning)
        self.client = self.app.test_client()

    def test_index(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("合約自動審查", res.get_data(as_text=True))

    def test_review_upload_and_feedback_learns(self):
        sample = REPO / "samples" / "訂購單合約_範例.docx"
        with sample.open("rb") as fh:
            res = self.client.post(
                "/api/review",
                data={"files": (fh, sample.name), "doc_type": "auto"},
                content_type="multipart/form-data",
            )
        self.assertEqual(res.status_code, 200)
        result = res.get_json()["results"][0]
        self.assertEqual(result["doc_type"], "purchase_order")
        self.assertGreaterEqual(result["counts"]["error"], 2)

        # 對第一個有節錄的發現回饋誤報 → 再審一次應被抑制
        finding = next(f for f in result["findings"] if f["snippet"])
        res = self.client.post(
            "/api/feedback",
            json={"verdict": "false_positive", "finding": finding, "file": sample.name},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["action"], "suppressed")

        with sample.open("rb") as fh:
            res = self.client.post(
                "/api/review",
                data={"files": (fh, sample.name), "doc_type": "auto"},
                content_type="multipart/form-data",
            )
        again = res.get_json()["results"][0]
        self.assertEqual(again["suppressed"], 1)
        self.assertNotIn(
            finding["signature"], [f["signature"] for f in again["findings"]]
        )

    def test_stats_endpoint(self):
        res = self.client.get("/api/stats")
        self.assertEqual(res.status_code, 200)
        self.assertIn("suppression_count", res.get_json())

    def test_feedback_extend_pattern_updates_rule(self):
        rules = self.tmp / "rules"
        rules.mkdir()
        (rules / "t.yaml").write_text(
            "doc_type: common\nrules:\n"
            "  - id: t-warranty\n    type: required\n    severity: warning\n"
            "    patterns: [\"保固\"]\n",
            encoding="utf-8",
        )
        from contract_review.webapp import create_app

        client = create_app(rules_dir=rules, learning_dir=self.learning).test_client()
        res = client.post(
            "/api/feedback",
            json={
                "verdict": "false_positive",
                "finding": {"rule_id": "t-warranty", "snippet": "", "location": "全文"},
                "file": "x.docx",
                "extend_pattern": "品質保證",
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["action"], "pattern_extended")
        self.assertIn("品質保證", (rules / "t.yaml").read_text(encoding="utf-8"))

    def test_reject_bad_extension(self):
        import io

        res = self.client.post(
            "/api/review",
            data={"files": (io.BytesIO(b"x"), "test.txt")},
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("不支援", res.get_json()["results"][0]["error"])


if __name__ == "__main__":
    unittest.main()
