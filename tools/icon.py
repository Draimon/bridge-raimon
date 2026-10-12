import sys, pymupdf
src, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src)
page = doc[0]
for size in (180, 512):
    z = size / page.rect.width
    page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False).save(f"{out}/icon-{size}.png")
print("ok")
