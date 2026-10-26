from pathlib import Path
import base64
root = Path(__file__).resolve().parent
src = root / "src"
html = (src / "shell.html").read_text(encoding="utf-8")
for marker, filename in [("CORE", "core.js"), ("CLADES", "clades.js"), ("PRESENTATION", "presentation.js"), ("STYLING", "styling.js"), ("EXTRAS", "extras.js"), ("APP", "app.js")]:
    html = html.replace("<!-- " + marker + " -->", "<script>\n" + (src / filename).read_text(encoding="utf-8") + "\n</script>")
logo = "data:image/png;base64," + base64.b64encode((root / "assets/logo.png").read_bytes()).decode("ascii")
html = html.replace("{{CANOPY_LOGO}}", logo)
(root / "index.html").write_text(html, encoding="utf-8")
print("Built index.html")
