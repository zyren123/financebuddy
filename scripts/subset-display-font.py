"""从得意黑完整字体生成站内标题字子集 public/fonts/fb-display.woff2。

子集覆盖 src/ 与出厂布局里出现的全部非 ASCII 字符、可打印 ASCII,以及现有子集
里已有的字(只增不减,避免删掉某处仍在用、但扫描不到的字)。新增标题文字后重跑即可,
不会再出现标题里混入回落字体的字。

上游:Smiley Sans v2.0.1(atelier-anchor/smiley-sans,SIL OFL 1.1)的
SmileySans-Oblique.ttf。OFL 的保留字体名条款要求修改版改名,这里改成
FB Display,同时保留版权与许可证记录。

    python scripts/subset-display-font.py /path/to/SmileySans-Oblique.ttf

依赖 fonttools 与 brotli。
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fonts" / "fb-display.woff2"
SOURCES = [*ROOT.glob("src/**/*.ts"), *ROOT.glob("src/**/*.tsx"), ROOT / "public" / "default-dashboard.json"]
NAMES = {1: "FB Display Oblique", 3: "FBDisplay-Oblique", 4: "FB Display Oblique", 6: "FBDisplay-Oblique", 16: "FB Display", 17: "Oblique"}
KEEP_NAMES = {0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17}


def wanted() -> set[int]:
    chars = {cp for cp in range(0x20, 0x7F)}
    if OUT.exists():
        chars.update(TTFont(OUT).getBestCmap())
    for path in SOURCES:
        chars.update(ord(ch) for ch in path.read_text(encoding="utf-8") if ord(ch) > 0x7F)
    return chars


def main(upstream: str) -> None:
    font = TTFont(upstream)
    available = set(font.getBestCmap())
    chars = wanted()
    # 只有 CJK 与全角标点缺字才算错;箭头、制表符等符号本来就由正文字体负责
    missing = sorted(cp for cp in chars - available if 0x3000 <= cp <= 0x9FFF or 0xFF00 <= cp <= 0xFFEF)
    if missing:
        sys.exit(f"上游字体缺字:{''.join(chr(cp) for cp in missing)}")
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = sorted(KEEP_NAMES)
    options.name_languages = [0x0409]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=chars & available)
    subsetter.subset(font)
    for record in font["name"].names:
        if record.nameID in NAMES:
            record.string = NAMES[record.nameID]
    font.flavor = "woff2"
    font.save(OUT)
    print(f"{OUT.relative_to(ROOT)}: {len(chars & available)} 个字符, {OUT.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
