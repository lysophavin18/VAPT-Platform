"""Render a silent, 75-second product overview. No live customer data used."""
import math
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, '/tmp/noovastack-video-deps')
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
W, H, FPS = 1280, 720, 24
BLUE, NAVY, MUTED = '#0B70C9', '#102033', '#53667B'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
scenes = [
    (10, 'THE CHALLENGE', 'Digital growth.\nGrowing exposure.', 'More assets. New vulnerabilities. Limited security resources.', ['Asset visibility', 'Emerging threats', 'Manual workflows']),
    (8, 'INTRODUCING', 'NoovaStack VAPT', 'A shared workspace for security assessment and oversight.', ['Discover', 'Assess', 'Review']),
    (12, 'KNOW YOUR ENVIRONMENT', 'Start with scope.\nBuild clear visibility.', 'Organize projects, assets and authorized testing engagements.', ['Projects & assets', 'Testing scope', 'Scan configuration']),
    (12, 'ASSESS WITH CONTEXT', 'Bring your security\nworkflow together.', 'Review scan progress, investigate findings and capture evidence.', ['Scan progress', 'Technical findings', 'Evidence review']),
    (11, 'VULNERABILITY INTELLIGENCE', 'Keep emerging risks\nin view.', 'Scheduled updates connect intelligence with detection workflows.', ['NVD CVE data', 'CISA KEV context', 'Nuclei templates']),
    (10, 'AI-ASSISTED ANALYSIS', 'Understand findings.\nExplore the next step.', 'AI supports explanation and remediation guidance for analysts.', ['Explain findings', 'Explore remediation', 'Human review']),
    (7, 'ACCOUNTABLE TESTING', 'Keep people in control.', 'Authorization and review support responsible security assessment.', ['Scope controls', 'Approvals', 'Audit trails']),
    (5, 'NOOVASTACK VAPT', 'Clearer visibility.\nBetter-informed decisions.', 'Cybersecurity assessment in one workspace.', []),
]

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)

def slide(index, local, duration):
    _, eyebrow, title, subtitle, cards = scenes[index]
    im = Image.new('RGB', (W, H), '#F5F8FC')
    d = ImageDraw.Draw(im)
    drift = int(14 * math.sin(local / duration * math.pi))
    d.ellipse((910 + drift, -230, 1480 + drift, 340), fill='#E7F1FB')
    d.ellipse((1120, 40, 1360, 280), outline='#C6DEF5', width=2)
    d.rounded_rectangle((64, 42, 106, 84), radius=12, fill=BLUE)
    d.text((72, 50), 'N', font=font(25, True), fill='white')
    d.text((120, 50), 'NoovaStack', font=font(23, True), fill=NAVY)
    d.text((1040, 54), 'VAPT PLATFORM', font=font(13, True), fill=MUTED)
    # Short vertical entrance; hold the copy for comfortable reading.
    offset = int(20 * max(0, 1 - local / .55) ** 2)
    d.text((68, 145 + offset), eyebrow, font=font(17, True), fill=BLUE)
    d.multiline_text((64, 190 + offset), title, font=font(53, True), fill=NAVY, spacing=8)
    d.text((68, 350 + offset), subtitle, font=font(21), fill=MUTED)
    for j, label in enumerate(cards):
        x = 68 + j * 382
        y = 448 + int(12 * max(0, 1 - (local - j * .12) / .6))
        d.rounded_rectangle((x, y, x + 358, y + 122), radius=18, fill='white', outline='#DCE6F1', width=2)
        d.ellipse((x + 22, y + 23, x + 49, y + 50), fill='#E7F1FB')
        d.text((x + 30, y + 25), str(j + 1), font=font(15, True), fill=BLUE)
        d.text((x + 22, y + 70), label, font=font(21, True), fill=NAVY)
    if not cards:
        d.rounded_rectangle((68, 445, 572, 505), radius=15, fill=BLUE)
        d.text((90, 462), 'Discover  /  Assess  /  Review', font=font(23, True), fill='white')
    d.line((68, 635, 1212, 635), fill='#DCE6F1', width=1)
    d.text((68, 656), 'PRODUCT OVERVIEW  /  AUTHORIZED SECURITY ASSESSMENT', font=font(12), fill=MUTED)
    d.text((1130, 653), f'{index + 1:02d} / 08', font=font(15), fill=MUTED)
    return im

def main():
    binary = imageio_ffmpeg.get_ffmpeg_exe()
    path = OUT / 'NoovaStack-Product-Overview.mp4'
    command = [binary, '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-s', f'{W}x{H}', '-pix_fmt', 'rgb24', '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(path)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    for index, (duration, *_) in enumerate(scenes):
        print(f'Rendering scene {index + 1}/8', flush=True)
        for frame in range(duration * FPS):
            t = frame / FPS
            im = slide(index, t, duration)
            fade = min(1, t / .35, (duration - t) / .35)
            if fade < 1:
                im = Image.blend(Image.new('RGB', (W, H), '#F5F8FC'), im, max(0, fade))
            process.stdin.write(im.tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError('Video encoding failed')
    slide(1, 3, 8).save(OUT / 'preview.png')
    print(path, flush=True)

if __name__ == '__main__':
    main()
