/** Requires an FFmpeg build with libx264; set FFMPEG to its executable path. */
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const data=JSON.parse(fs.readFileSync(path.join(__dirname,'campaign.json'),'utf8'));const ffmpeg=process.env.FFMPEG||'ffmpeg';
// Original, sample-free instrumental bed: gentle pulse, bass and sparse pentatonic bells.
// All waveforms are synthesized here. No recordings, platform music or third-party samples.
const rate=44100,duration=15,count=rate*duration;const wave=Buffer.alloc(44+count*4);
wave.write('RIFF',0);wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(2,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*4,28);wave.writeUInt16LE(4,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(count*4,40);
let seed=260924;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296*2-1;};const beat=60/100,notes=[220,261.6256,329.6276,391.9954,440,391.9954,329.6276,261.6256];
for(let i=0;i<count;i++){
 const t=i/rate,b=t%beat,half=t%(beat/2),n=notes[Math.floor(t/(beat*2))%notes.length];
 const kick=.18*Math.sin(2*Math.PI*(48*b+4*(1-Math.exp(-b*26))))*Math.exp(-b*25);
 const hat=random()*.025*Math.exp(-half*110);
 const bell=(Math.sin(2*Math.PI*n*t)+.2*Math.sin(2*Math.PI*n*2*t))*.075*Math.exp(-(t%(beat*2))*2.3);
 const bass=.035*Math.sin(2*Math.PI*55*t)*(1-Math.exp(-b*35))*Math.exp(-b*4);
 const fade=Math.min(1,t/.4,(duration-t)/1.2),value=Math.tanh((kick+hat+bell+bass)*1.5)*fade;
 const sample=Math.round(Math.max(-1,Math.min(1,value))*32767);wave.writeInt16LE(sample,44+i*4);wave.writeInt16LE(sample,46+i*4);
}
const audio=path.join(root,'assets','sportstage-original-bed.wav');fs.writeFileSync(audio,wave);
function run(args){const r=spawnSync(ffmpeg,args,{encoding:'utf8',maxBuffer:8*1024*1024});if(r.error)throw r.error;if(r.status!==0)throw Error(r.stderr);return r.stderr;}
const report=[];
for(const v of data.videos){
 const args=['-hide_banner','-y','-filter_complex_threads','2'];
 for(const id of v.scenes)args.push('-loop','1','-framerate','30','-i',path.join(root,'posts',id+'-story.png'));
 args.push('-i',audio);
 const filters=v.scenes.map((_,i)=>`[${i}:v]scale=1440:2560,zoompan=z='1+0.00010*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,trim=duration=5.4,setpts=PTS-STARTPTS,format=yuv420p,setsar=1,fps=30,settb=1/30[v${i}]`);
 filters.push('[v0][v1]xfade=transition=fade:duration=0.6:offset=4.8,fps=30,settb=1/30[x1]','[x1][v2]xfade=transition=fade:duration=0.6:offset=9.6[out]');
 const output=path.join(root,'videos',v.id+'.mp4');
 args.push('-filter_complex',filters.join(';'),'-map','[out]','-map','3:a:0','-t','15','-c:v','libx264','-preset','fast','-crf','20','-threads','4','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',output);
 run(args);
 const checks=run(['-hide_banner','-i',output,'-f','null','-']);
 if(!checks.includes('1080x1920')||!checks.includes('h264')||!checks.includes('aac'))throw Error('Unexpected media format for '+v.id);
 const srt=v.subtitles.map((s,i)=>(i+1)+'\n'+['00:00:00,000 --> 00:00:05,100','00:00:05,100 --> 00:00:09,900','00:00:09,900 --> 00:00:15,000'][i]+'\n'+s+'\n').join('\n');
 fs.writeFileSync(path.join(root,'videos',v.id+'.srt'),srt);
 // A still extracted from the final encoded stream, for visual QA and optional cover use.
 run(['-hide_banner','-y','-ss','2','-i',output,'-frames:v','1',path.join(root,'videos',v.id+'-cover.jpg')]);
 report.push({id:v.id,file:'videos/'+v.id+'.mp4',width:1080,height:1920,seconds:15,fps:30,video:'H.264',audio:'AAC stereo',bytes:fs.statSync(output).size,decode:'PASS'});
 console.log('Rendered and decoded '+v.id+' (15 seconds, 1080x1920).');
}
fs.writeFileSync(path.join(root,'video-validation.json'),JSON.stringify(report,null,2));
