"""審查紀錄測試：python -m unittest discover tests"""

import shutil
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from contract_review.engine import review_file  # noqa: E402
from contract_review.reviewlog import query_log, record_review  # noqa: E402


class TestReviewLog(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.sample = REPO / "samples" / "訂購單合約_範例.docx"

    def _review(self, record=True):
        return review_file(self.sample, learning_dir=self.tmp, record=record)

    def test_review_writes_log_with_summary(self):
        self._review()
        entries = query_log(self.tmp)
        self.assertEqual(len(entries), 1)
        e = entries[0]
        self.assertEqual(e["file"], self.sample.name)
        self.assertEqual(e["doc_type"], "purchase_order")
        self.assertEqual(e["time"][:10], datetime.now().strftime("%Y-%m-%d"))
        self.assertGreaterEqual(e["counts"]["error"], 2)
        self.assertIn("合約金額", e["summary"])

    def test_no_log_flag(self):
        self._review(record=False)
        self.assertEqual(query_log(self.tmp), [])

    def test_keyword_filter(self):
        self._review()
        self.assertEqual(len(query_log(self.tmp, keyword="訂購單")), 1)
        self.assertEqual(len(query_log(self.tmp, keyword="大甲精機")), 1)  # 摘要內容也可查
        self.assertEqual(query_log(self.tmp, keyword="不存在的字"), [])

    def test_date_filter(self):
        self._review()
        today = datetime.now().strftime("%Y-%m-%d")
        self.assertEqual(len(query_log(self.tmp, date_from=today, date_to=today)), 1)
        self.assertEqual(query_log(self.tmp, date_to="2000-01-01"), [])
        self.assertEqual(query_log(self.tmp, date_from="2999-01-01"), [])

    def test_newest_first_and_limit(self):
        result = self._review(record=False)
        for _ in range(3):
            record_review(result, self.tmp)
        entries = query_log(self.tmp, limit=2)
        self.assertEqual(len(entries), 2)


class TestWebLogApi(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        from contract_review.webapp import create_app

        self.client = create_app(
            rules_dir=REPO / "rules", learning_dir=self.tmp
        ).test_client()

    def test_upload_then_query_log(self):
        sample = REPO / "samples" / "訂購單合約_範例.docx"
        with sample.open("rb") as fh:
            self.client.post(
                "/api/review",
                data={"files": (fh, sample.name)},
                content_type="multipart/form-data",
            )
        res = self.client.get("/api/log")
        self.assertEqual(res.status_code, 200)
        entries = res.get_json()["entries"]
        self.assertEqual(len(entries), 1)
        # 網頁上傳走暫存檔，紀錄須是原始檔名而非暫存檔名
        self.assertEqual(entries[0]["file"], sample.name)
        res = self.client.get("/api/log?q=不存在的字")
        self.assertEqual(res.get_json()["entries"], [])


if __name__ == "__main__":
    unittest.main()
