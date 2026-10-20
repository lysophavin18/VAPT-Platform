"""Render a 75-second narrated marketing preview; presenter is a still image."""
import asyncio, json, math, subprocess, sys, textwrap
from pathlib import Path
sys.path.insert(0, '/tmp/noovastack-marketing-deps')
import edge_tts
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent
WORK=ROOT/'marketing-preview-build'; WORK.mkdir(exist_ok=True)
FF='ffmpeg'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
SCENES=[
(9,'SEE THE RISK.','Understand\nthe next step.','Your next security decision starts with a question: what needs attention, and what should your team do next?',[]),
(9,'ONE WORKSPACE.','A clearer\nsecurity picture.','Meet Noova Stack V A P T. Bring your security assessments, findings, and reporting into one connected workspace.',[5]),
(12,'START WITH SCOPE.','Organize.\nScope.\nAssess.','Organize projects. Define your scope. Keep approved assets in view, so every assessment starts with a clear plan.',[15,25]),
(13,'FOLLOW THE EVIDENCE.','From findings\nto informed\naction.','Follow scan progress and investigate findings with supporting evidence. Review severity, explore remediation, and track what still needs attention.',[35,44]),
(12,'PEOPLE IN CONTROL.','AI assistance.\nHuman\noversight.','Use AI assistance to support analysis and remediation planning, while scope controls and approval workflows keep people in control.',[74,54]),
(10,'MAKE IT CLEAR.','Report.\nShare.\nAct.','Turn assessment work into professional reports your team can review, share, and act on.',[84]),
(10,'NOOVASTACK VAPT','Clearer visibility.\nBetter-informed\nsecurity decisions.','Noova Stack V A P T. Clearer visibility. Better-informed security decisions. Request a demo and see your assessment workflow come together.',[]),
]
def run(args):
    subprocess.run([FF,'-y','-hide_banner','-loglevel','error',*map(str,args)],check=True)
def duration(path):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(path)]))
def timestamp(t):
    ms=round(t*1000); return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
def background(i,title,headline,cover):
    im=Image.new('RGB',(1920,1080),'#F5F8FC'); d=ImageDraw.Draw(im)
    d.rectangle((0,0,1920,12),fill='#147ADD')
    d.text((80,55),'NOOVASTACK',font=ImageFont.truetype(BOLD,30),fill='#0C65B6')
    d.text((355,61),'VAPT PLATFORM',font=ImageFont.truetype(FONT,21),fill='#4F647A')
    d.text((1680,59),f'0{i+1} / 07',font=ImageFont.truetype(FONT,23),fill='#6C8095')
    d.line((80,115,1840,115),fill='#D8E5F2',width=2)
    y=260 if cover else 190
    d.text((80,y),title,font=ImageFont.truetype(BOLD,24 if cover else 20),fill='#1176CE')
    d.multiline_text((80,y+60),headline,font=ImageFont.truetype(BOLD,54 if cover else 40),spacing=15,fill='#102C48')
    if cover:
        tag='Request a demo' if i==6 else 'Security assessment. Connected.'
        d.rounded_rectangle((80,650,640,730),radius=14,fill='#126FC1')
        d.text((110,675),tag,font=ImageFont.truetype(BOLD,24),fill='white')
    else:
        d.text((80,850),'Discover / Assess / Review',font=ImageFont.truetype(FONT,20),fill='#526C86')
    d.rounded_rectangle((250,956,1670,1060),radius=16,fill='#102C48')
    p=WORK/f'bg-{i}.png'; im.save(p); return p
async def main():
    subtitles=[]; timeline=0; scenes=[]
    for i,(length,title,headline,spoken,offsets) in enumerate(SCENES):
        print(f'Preparing scene {i+1}/7 narration',flush=True)
        audio=WORK/f'voice-{i}.mp3'; timing=WORK/f'voice-{i}.json'
        if not audio.exists() or not timing.exists():
            words=[]
            with audio.open('wb') as f:
                async for chunk in edge_tts.Communicate(spoken,'en-US-JennyNeural',rate='+0%',boundary='WordBoundary').stream():
                    if chunk['type']=='audio': f.write(chunk['data'])
                    elif chunk['type']=='WordBoundary': words.append(chunk)
            timing.write_text(json.dumps(words))
        words=json.loads(timing.read_text()); rawdur=duration(audio)
        available=length-(1.3 if i==6 else 1.0)
        tempo=max(0.85,min(1.35,rawdur/available))
        if rawdur/tempo>length-.65: raise RuntimeError('Narration does not fit')
        delay=.35
        for j in range(0,len(words),7):
            group=words[j:j+7]; start=group[0]['offset']/1e7/tempo+timeline+delay
            end=(group[-1]['offset']+group[-1]['duration'])/1e7/tempo+timeline+delay
            text=' '.join(w['text'] for w in group)
            subtitles.append((start,min(end+.12,timeline+length-.15),text))
        voice=WORK/f'voice-{i}.wav'
        run(['-i',audio,'-af',f'atempo={tempo},adelay=350:all=1,apad','-t',length,'-ar','48000',voice])
        bg=background(i,title,headline,not offsets)
        pieces=[]
        for k,offset in enumerate(offsets or [None]):
            partlen=length/len(offsets) if offsets else length
            inp=['-loop','1','-framerate','30','-i',bg,'-loop','1','-framerate','30','-i',ROOT/'NoovaStack-Presenter.png']
            if offset is not None:
                inp+=['-ss',offset,'-t',min(5,partlen),'-i',ROOT/'NoovaStack-Localhost-Tour.mp4']
                graph=('[1:v]scale=-2:410,crop=410:410[p];[0:v][p]overlay=80:420[b];'
                       '[2:v]scale=1280:800,setsar=1,tpad=stop_mode=clone:stop_duration=15[t];'
                       '[b][t]overlay=560:145')
            else:
                graph=('[1:v]scale=-2:820,crop=880:820[p];[0:v][p]overlay=960:130')
            graph+=f',fade=t=in:st=0:d=0.25:color=0xF5F8FC,fade=t=out:st={partlen-.25}:d=0.25:color=0xF5F8FC[v]'
            piece=WORK/f'part-{i}-{k}.mp4'
            print(f'Rendering scene {i+1}, shot {k+1}',flush=True)
            run([*inp,'-filter_complex_threads','2','-filter_complex',graph,'-map','[v]','-t',partlen,'-an','-r','30','-c:v','libx264','-threads','2','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',piece])
            pieces.append(piece)
        listing=WORK/f'scene-{i}.txt'; listing.write_text(''.join(f"file '{p}'\n" for p in pieces))
        scene=WORK/f'scene-{i}.mp4'
        run(['-f','concat','-safe','0','-i',listing,'-i',voice,'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-t',length,scene])
        scenes.append(scene); timeline+=length
    subtitles=[(s,min(e,subtitles[i+1][0]-.01) if i+1<len(subtitles) else e,t) for i,(s,e,t) in enumerate(subtitles)]
    srt=ROOT/'NoovaStack-Marketing-Preview-1080p.srt'
    srt.write_text(''.join(f'{i+1}\n{timestamp(s)} --> {timestamp(e)}\n{textwrap.fill(t,58)}\n\n' for i,(s,e,t) in enumerate(subtitles)))
    listing=WORK/'all-scenes.txt'; listing.write_text(''.join(f"file '{p}'\n" for p in scenes))
    output=ROOT/'NoovaStack-Marketing-Preview-1080p.mp4'
    print('Mastering audio and burning captions',flush=True)
    run(['-f','concat','-safe','0','-i',listing,'-vf',f"subtitles={srt}:force_style='FontName=DejaVu Sans,FontSize=11,PrimaryColour=&HFFFFFF,Outline=0,Shadow=0,MarginV=12,Alignment=2'",'-af','loudnorm=I=-16:TP=-1:LRA=9','-c:v','libx264','-threads','2','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k','-ar','48000','-t','75','-movflags','+faststart',output])
    (ROOT/'marketing-preview-notes.txt').write_text('75-second 1920x1080 marketing preview. Synthetic English voice: en-US-JennyNeural. Presenter is a still image, not lip-synced. Actual product footage, seven scenes, burned-in captions and matching SRT. No HeyGen job submitted.\n')
    print(output,flush=True)
asyncio.run(main())
