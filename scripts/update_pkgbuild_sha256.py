#!/usr/bin/env python3
import re, sys

sha256 = sys.argv[1]
path = sys.argv[2]

content = open(path).read()
content = re.sub(
    r"(sha256sums=\(\n\s*)'[^']*'",
    r"\g<1>'" + sha256 + "'",
    content,
    count=1
)
open(path, 'w').write(content)
