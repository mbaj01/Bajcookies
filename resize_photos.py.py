from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path("photos")
TARGET_W, TARGET_H = 1200, 900
EXTENSIONS = {".jpg", ".jpeg", ".jfif", ".png", ".webp"}


def process_image(path: Path):
	with Image.open(path) as img:
		img = ImageOps.exif_transpose(img)
		img = img.convert("RGB")

		src_w, src_h = img.size
		target_ratio = TARGET_W / TARGET_H
		src_ratio = src_w / src_h

		if src_ratio > target_ratio:
			# Too wide: crop left/right.
			new_w = int(src_h * target_ratio)
			left = (src_w - new_w) // 2
			img = img.crop((left, 0, left + new_w, src_h))
		else:
			# Too tall: crop top/bottom.
			new_h = int(src_w / target_ratio)
			top = (src_h - new_h) // 2
			img = img.crop((0, top, src_w, top + new_h))

		img = img.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)

		# Save back to same path to keep menu paths unchanged.
		img.save(path, quality=88, optimize=True)


def main():
	files = [p for p in ROOT.rglob("*") if p.suffix.lower() in EXTENSIONS]
	for f in files:
		try:
			process_image(f)
			print(f"OK: {f}")
		except Exception as e:
			print(f"SKIP: {f} -> {e}")

	print(f"Done. Processed {len(files)} files.")


if __name__ == "__main__":
	main()