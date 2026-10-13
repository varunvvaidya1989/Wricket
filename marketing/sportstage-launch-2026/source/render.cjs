/** Run from any directory. Set PLAYWRIGHT_MODULE if Playwright is installed outside this folder. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'campaign.json'), 'utf8'));
const mime = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.ttf':'font/ttf', '.mp4':'video/mp4' };
const server = http.createServer((req,res) => {
  const target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', mime[path.extname(target)] || 'text/plain'); fs.createReadStream(target).pipe(res);
});
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless:true });
  const manifest=[];const failures=[];
  try {
    for (const format of ['feed','square','story','landscape']) {
      const w=format==='landscape'?1600:1080,h={feed:1350,square:1080,story:1920,landscape:900}[format];
      const scale=['feed','story'].includes(format)?4/3:1;
      const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:scale});
      page.on('pageerror',error=>failures.push(error.message));
      const items=format==='landscape'?data.posts.filter(p=>['01-brand','05-organizers','12-intro'].includes(p.id)):data.posts;
      for(const p of items){
        await page.goto(base+'/source/creative.html?id='+p.id+'&format='+format);await page.waitForFunction(()=>window.renderReady);
        const file='posts/'+p.id+'-'+format+'.png';await page.screenshot({path:path.join(root,file)});
        const invalid=await page.evaluate(()=>[...document.querySelectorAll('h1,.category,.body,.cta,.logo')].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight||el.scrollWidth>el.clientWidth+1;}).map(el=>el.className||el.tagName));
        if(invalid.length)failures.push(p.id+' '+format+': '+invalid.join(','));
        manifest.push({id:p.id,format,file,width:Math.round(w*scale),height:Math.round(h*scale),alt:p.alt});
      }
      if(format==='square')for(const p of data.carousel){
        await page.goto(base+'/source/creative.html?id='+p.id+'&format=square');await page.waitForFunction(()=>window.renderReady);
        const file='posts/'+p.id+'.png';await page.screenshot({path:path.join(root,file)});manifest.push({id:p.id,format:'carousel',file,width:1080,height:1080,alt:p.headline.replace(/<[^>]*>/g,' ')+' '+p.body});
      }
      await page.close();
    }
    fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({campaign:data.campaign,cta:data.cta,assets:manifest,videos:data.videos},null,2));
    const cards=data.posts.map(p=>'<article><img loading="lazy" src="posts/'+p.id+'-feed.png" alt="'+escape(p.alt)+'"><div class="info"><h3>'+escape(p.category)+'</h3><p>'+escape(p.headline.replace(/<[^>]*>/g,' '))+'</p><nav>'+['feed','square','story',...(['01-brand','05-organizers','12-intro'].includes(p.id)?['landscape']:[])].map(f=>'<a download href="posts/'+p.id+'-'+f+'.png">'+f+'</a>').join('')+'</nav><details><summary>Alt text</summary><p>'+escape(p.alt)+'</p></details></div></article>').join('');
    fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SportStage | Campaign studio</title><style>@font-face{font-family:Stage;src:url(assets/SpaceGrotesk-Bold.ttf)}@font-face{font-family:Inter;src:url(assets/Inter-Regular.ttf)}*{box-sizing:border-box}body{margin:0;background:#0b100e;color:#f0f4ef;font-family:Inter, sans-serif}header,main{max-width:1440px;margin:auto;padding:48px 32px}header{border-bottom:1px solid #2a352e}header img{width:64px;border-radius:16px}h1{font:700 clamp(36px,6vw,78px)/1.08 Stage;margin:24px 0;letter-spacing:-2px}h1 span{color:#a6f477}h2{font:700 32px Stage;margin-top:52px}p{line-height:1.65;color:#bdccc2}a{color:#a6f477}nav{display:flex;gap:12px;flex-wrap:wrap}nav a{padding:9px 14px;border:1px solid #39493b;border-radius:8px;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}article{border:1px solid #2a352e;border-radius:16px;overflow:hidden;background:#151c18}article img{width:100%;display:block}.info{padding:20px}h3{font-size:13px;letter-spacing:1px}details{margin-top:18px;color:#bdccc2;font-size:13px}video{width:100%;max-height:600px;background:#050907}.carousel{display:flex;gap:16px;overflow-x:auto;padding-bottom:20px}.carousel a{flex:0 0 300px}.carousel img{width:300px;border-radius:12px}small{color:#93a398}</style></head><body><header><img src="assets/logo.png" alt="SportStage"><h1>Every sport.<br><span>One stage.</span></h1><p>India-first · English campaign kit · 12 concepts · 45 ready-to-post graphics · 4 short videos</p><nav><a href="#posts">Browse graphics</a><a href="#videos">Watch videos</a><a href="copy/POSTS.md">Copy captions</a><a href="copy/30-day-calendar.csv" download>30-day calendar</a><a href="README.md">Publishing guide</a></nav><p><small>Current CTA: Follow for launch updates. No public store availability is claimed. App screenshot uses demo players; score/sponsor cards are labelled illustrations.</small></p></header><main><h2 id="posts">The campaign</h2><div class="grid">'+cards+'</div><h2>The matchday playbook</h2><p>Six slides, in order. Post together as a carousel.</p><div class="carousel">'+data.carousel.map(p=>'<a href="posts/'+p.id+'.png" download><img src="posts/'+p.id+'.png" alt="'+escape(p.headline.replace(/<[^>]*>/g,' '))+'"></a>').join('')+'</div><h2 id="videos">15-second social films</h2><p>Vertical MP4 · Original instrumental audio · Captions in-frame · Sidecar subtitles included</p><div class="grid">'+data.videos.map(v=>'<article><video controls preload="metadata" poster="posts/'+v.scenes[0]+'-story.png" src="videos/'+v.id+'.mp4"></video><div class="info"><h3>'+escape(v.title)+'</h3><nav><a download href="videos/'+v.id+'.mp4">MP4</a><a download href="videos/'+v.id+'.srt">SRT</a></nav></div></article>').join('')+'</div><h2>Source files</h2><p>Editable artwork: <a href="source/campaign.json">campaign.json</a> and <a href="source/creative.html">HTML/CSS template</a>. Full inventory: <a href="manifest.json">manifest.json</a>. Artwork provenance and prompts: <a href="source/PROVENANCE.md">PROVENANCE.md</a>.</p></main></body></html>');
    const galleryPath=path.join(root,'index.html');
    const gallery=fs.readFileSync(galleryPath,'utf8')
      .replace('minmax(280px,1fr)','minmax(min(100%,280px),1fr)')
      .replace('<a href="README.md">Publishing guide</a>','<a href="README.md">Publishing guide</a><a href="organizer-one-pager.pdf">Organizer brochure</a>');
    fs.writeFileSync(galleryPath,gallery);
    const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
    await page.goto(base+'/index.html');await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,'campaign-preview.png')});
    if(failures.length)throw Error(failures.join('\n'));
    console.log('PASS: '+manifest.length+' PNG exports; all headline/body/CTA bounds checked; no browser runtime errors.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
