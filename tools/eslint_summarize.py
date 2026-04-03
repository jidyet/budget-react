import json
import collections
from pathlib import Path

p = Path('eslint-report-src.json')
if not p.exists():
    print('eslint-report-src.json not found')
    raise SystemExit(1)

encodings = ['utf-8', 'utf-16', 'utf-16-le', 'utf-16-be', 'latin-1']
data = None
for enc in encodings:
    try:
        s = p.read_text(encoding=enc)
        data = json.loads(s)
        print('Loaded with', enc)
        break
    except Exception as e:
        # print('enc failed', enc, e)
        data = None

if data is None:
    print('Failed to parse eslint-report-src.json with tried encodings')
    raise SystemExit(2)

file_counts = collections.Counter()
rule_counts = collections.Counter()
per_file_rules = {}
for item in data:
    fp = item.get('filePath') or item.get('file')
    messages = item.get('messages', [])
    file_counts[fp] += len(messages)
    rc = collections.Counter(m.get('ruleId') for m in messages if m.get('ruleId'))
    rule_counts.update(rc)
    per_file_rules[fp] = rc

summary = {
    'top_files': file_counts.most_common(50),
    'top_rules': rule_counts.most_common(50)
}
with open('eslint-summary.json', 'w', encoding='utf8') as out:
    json.dump(summary, out, indent=2, ensure_ascii=False)
print('Wrote eslint-summary.json')
