"""審查結果的資料結構。"""

from __future__ import annotations

from dataclasses import dataclass

SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}
SEVERITY_LABEL = {"error": "錯誤", "warning": "警告", "info": "提示"}


@dataclass
class Finding:
    rule_id: str
    severity: str  # error / warning / info
    message: str
    location: str = ""
    snippet: str = ""

    def sort_key(self):
        return (SEVERITY_ORDER.get(self.severity, 9), self.rule_id, self.location)
