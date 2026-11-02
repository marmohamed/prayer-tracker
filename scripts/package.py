"""Create a portable source archive, excluding dependencies and local/runtime state."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
out = root / 'artifacts' / 'prayer-tracker.zip'
out.parent.mkdir(exist_ok=True)
exclude = {'.git', 'node_modules', 'dist', 'artifacts', 'test-results', 'playwright-report', '__pycache__'}
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if path.is_file() and not any(part in exclude for part in relative.parts) and path.name != '.DS_Store' and not path.name.endswith('.local'):
            archive.write(path, Path('prayer-tracker') / relative)
print(out)
