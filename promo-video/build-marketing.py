"""Build a narrated product film from the real local-platform recording."""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FF = '/tmp/noovastack-video-deps/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
WORK = ROOT / 'marketing-build'
WORK.mkdir(exist_ok=True)

def run(args):
    subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', *args], check=True)

def card(name, heading, subtitle):
    im = Image.new('RGB', (1280,720), '#F5F8FC')
    d = ImageDraw.Draw(im)
    d.ellipse((920,-220,1530,390),fill='#E4EFFA')
    d.text((80,100),'NOOVASTACK  /  VAPT PLATFORM',font=ImageFont.truetype(BOLD,22),fill='#0B70C9')
    d.multiline_text((80,240),heading,font=ImageFont.truetype(BOLD,55),fill='#102033',spacing=14)
    d.text((80,435),subtitle,font=ImageFont.truetype(FONT,25),fill='#53667B')
    d.line((80,600,1200,600),fill='#DCE6F1',width=2)
    d.text((80,635),'Discover  /  Assess  /  Review',font=ImageFont.truetype(FONT,20),fill='#0B70C9')
    target=WORK / (name+'.png')
    im.save(target)
    return target

intro=card('opening','Security assessment.\nOne connected workspace.','Introducing NoovaStack VAPT')
end=card('closing','Clearer visibility.\nBetter-informed decisions.','NoovaStack VAPT')
segments=[]
def encode(inputs, filt, duration, number):
    target=WORK / f'{number:02d}.mp4'
    run([*inputs,'-filter_complex',filt,'-t',str(duration),'-an','-r','25','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',str(target)])
    segments.append(target)

encode(['-loop','1','-i',str(intro)],'fade=t=in:st=0:d=0.4',4,0)
# Source offsets are taken from the actual browser tour, after each page loaded.
shots=[(5,'YOUR SECURITY WORKSPACE'),(15,'ORGANIZE PROJECTS'),(25,'UNDERSTAND YOUR ASSETS'),
       (35,'FOLLOW YOUR ASSESSMENTS'),(44,'INVESTIGATE FINDINGS'),(74,'AI-ASSISTED ANALYSIS'),
       (54,'REVIEW AND APPROVE'),(84,'REPORTS AND RESULTS')]
for i,(offset,title) in enumerate(shots,1):
    print(f'Editing real platform footage {i}/8',flush=True)
    header=Image.new('RGB',(1280,60),'#F5F8FC')
    draw=ImageDraw.Draw(header)
    draw.text((30,22),'NOOVASTACK',font=ImageFont.truetype(BOLD,18),fill='#0B70C9')
    draw.text((400,22),title,font=ImageFont.truetype(FONT,18),fill='#102033')
    header_path=WORK/f'header-{i}.png'
    header.save(header_path)
    filt=('[0:v]scale=1024:640,pad=1280:720:128:65:color=0xF5F8FC,'
          'tpad=stop_mode=clone:stop_duration=10[v];[v][1:v]overlay=0:0,fade=t=in:st=0:d=0.25')
    encode(['-ss',str(offset),'-t','6','-i',str(ROOT/'NoovaStack-Localhost-Tour.mp4'),'-i',str(header_path)],filt,10,i)
encode(['-loop','1','-i',str(end)],'fade=t=in:st=0:d=0.4,fade=t=out:st=5:d=1',6,9)
listing=WORK/'segments.txt'
listing.write_text(''.join(f"file '{p}'\n" for p in segments))
output=ROOT/'NoovaStack-Marketing-Narrated.mp4'
run(['-f','concat','-safe','0','-i',str(listing),'-i',str(ROOT/'NoovaStack-Narration.mp3'),
     '-filter_complex','[1:a]adelay=2000:all=1,apad,afade=t=out:st=88:d=2[a]',
     '-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','128k','-t','90','-movflags','+faststart',str(output)])
print(output,flush=True)
