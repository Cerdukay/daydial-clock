"""Generate DayDial PWA icons (192, 512, badge-72) using PIL."""
from PIL import Image, ImageDraw
import math
import os

BASE = os.path.join(os.path.dirname(__file__), "..", "public")


def create_clock_icon(size, bg_color="#0a0a0a", accent="#06b6d4", face_color="#FAFAF8"):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # Fill entire canvas for maskable icons
    draw.rectangle([0, 0, size, size], fill=bg_color)

    # Clock face circle
    face_r = int(size * 0.38)
    draw.ellipse([cx - face_r, cy - face_r, cx + face_r, cy + face_r], fill=face_color)

    # Hour marks (12 ticks)
    for i in range(12):
        angle = math.radians(i * 30 - 90)
        x1 = cx + int(math.cos(angle) * face_r * 0.88)
        y1 = cy + int(math.sin(angle) * face_r * 0.88)
        x2 = cx + int(math.cos(angle) * face_r * 0.78)
        y2 = cy + int(math.sin(angle) * face_r * 0.78)
        tick_w = max(2, size // 96)
        draw.line([x1, y1, x2, y2], fill="#1a1a1a", width=tick_w)

    # Hour hand (pointing to 10 o'clock)
    hour_angle = math.radians(-60)
    hour_len = int(face_r * 0.5)
    hand_w = max(3, size // 64)
    draw.line(
        [cx, cy, cx + int(math.cos(hour_angle) * hour_len), cy + int(math.sin(hour_angle) * hour_len)],
        fill="#1a1a1a",
        width=hand_w,
    )

    # Minute hand (pointing to 2 o'clock)
    min_angle = math.radians(60)
    min_len = int(face_r * 0.72)
    draw.line(
        [cx, cy, cx + int(math.cos(min_angle) * min_len), cy + int(math.sin(min_angle) * min_len)],
        fill=accent,
        width=hand_w,
    )

    # Center dot
    dot_r = max(3, size // 80)
    draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill="#1a1a1a")

    return img


def create_badge(size=72):
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.ellipse([4, 4, size - 4, size - 4], fill="#06b6d4")
    inner_r = int(size * 0.25)
    cx = cy = size // 2
    bd.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill="#FAFAF8")
    bd.line([cx, cy, cx, cy - int(inner_r * 0.6)], fill="#1a1a1a", width=3)
    bd.line([cx, cy, cx + int(inner_r * 0.7), cy], fill="#06b6d4", width=3)
    return badge


if __name__ == "__main__":
    icon192 = create_clock_icon(192)
    icon192.save(os.path.join(BASE, "icon-192.png"), "PNG")

    icon512 = create_clock_icon(512)
    icon512.save(os.path.join(BASE, "icon-512.png"), "PNG")

    badge = create_badge(72)
    badge.save(os.path.join(BASE, "badge-72.png"), "PNG")

    print("PWA icons created: icon-192.png, icon-512.png, badge-72.png")
