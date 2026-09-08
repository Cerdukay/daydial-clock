"""Generate DayDial Android app icons at all required densities."""
from PIL import Image, ImageDraw
import math
import os

ANDROID_RES = os.path.join(
    os.path.dirname(__file__), "..", "android", "app", "src", "main", "res"
)

# Standard Android launcher icon densities
DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Foreground (for adaptive icons) — 108dp viewport, icon in center
FOREGROUND_DENSITIES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def create_clock_icon(size, bg_color="#0a0a0a", accent="#06b6d4", face_color="#FAFAF8"):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # Fill entire canvas
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


def create_foreground(size, accent="#06b6d4", face_color="#FAFAF8"):
    """Create the foreground for adaptive icons — clock on transparent background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # Clock face circle — centered in the 108dp viewport safe zone (66%)
    face_r = int(size * 0.25)
    draw.ellipse([cx - face_r, cy - face_r, cx + face_r, cy + face_r], fill=face_color)

    # Hour marks
    for i in range(12):
        angle = math.radians(i * 30 - 90)
        x1 = cx + int(math.cos(angle) * face_r * 0.88)
        y1 = cy + int(math.sin(angle) * face_r * 0.88)
        x2 = cx + int(math.cos(angle) * face_r * 0.78)
        y2 = cy + int(math.sin(angle) * face_r * 0.78)
        tick_w = max(2, size // 120)
        draw.line([x1, y1, x2, y2], fill="#1a1a1a", width=tick_w)

    # Hour hand
    hour_angle = math.radians(-60)
    hour_len = int(face_r * 0.5)
    hand_w = max(3, size // 80)
    draw.line(
        [cx, cy, cx + int(math.cos(hour_angle) * hour_len), cy + int(math.sin(hour_angle) * hour_len)],
        fill="#1a1a1a",
        width=hand_w,
    )

    # Minute hand
    min_angle = math.radians(60)
    min_len = int(face_r * 0.72)
    draw.line(
        [cx, cy, cx + int(math.cos(min_angle) * min_len), cy + int(math.sin(min_angle) * min_len)],
        fill=accent,
        width=hand_w,
    )

    # Center dot
    dot_r = max(2, size // 100)
    draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill="#1a1a1a")

    return img


if __name__ == "__main__":
    # Generate launcher icons (legacy)
    for folder, size in DENSITIES.items():
        icon = create_clock_icon(size)
        path = os.path.join(ANDROID_RES, folder, "ic_launcher.png")
        icon.save(path, "PNG")
        # Round variant
        path_round = os.path.join(ANDROID_RES, folder, "ic_launcher_round.png")
        icon.save(path_round, "PNG")

    # Generate foreground for adaptive icons
    for folder, size in FOREGROUND_DENSITIES.items():
        fg = create_foreground(size)
        path = os.path.join(ANDROID_RES, folder, "ic_launcher_foreground.png")
        fg.save(path, "PNG")

    print("Android app icons generated at all densities")
