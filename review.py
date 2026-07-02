#!/usr/bin/env python3
"""合約自動審查工具入口。用法見 README.md 或 `python review.py --help`。"""

import sys

from contract_review.cli import main

if __name__ == "__main__":
    sys.exit(main())
