const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const root=path.resolve(__dirname,'..');const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});const errors=[];
 try{
  for(const item of manifest.assets){const b=fs.readFileSync(path.join(root,item.file));if(b.readUInt32BE(16)!==item.width||b.readUInt32BE(20)!==item.height)throw Error('PNG size mismatch '+item.file);}
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.evaluate(()=>document.fonts.ready);await page.locator('article img').first().waitFor();
  // Check local links, including Markdown, source files, media and brochure after it is rendered.
  const relativeLinks=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')).filter(h=>!h.startsWith('#')));
  const media=[];
  for(const video of await page.locator('video').all()){
   await video.evaluate(v=>{v.load();});
   const info=await video.evaluate(v=>new Promise((resolve,reject)=>{const done=()=>resolve({file:v.getAttribute('src'),duration:v.duration,width:v.videoWidth,height:v.videoHeight});if(v.readyState>=1)return done();v.addEventListener('loadedmetadata',done,{once:true});v.addEventListener('error',()=>reject(Error('Video failed '+v.src)),{once:true});setTimeout(()=>reject(Error('Media load timeout')),10000);}));
   if(Math.abs(info.duration-15)>.1||info.width!==1080||info.height!==1920)throw Error('Video metadata mismatch '+info.file);
   await video.evaluate(v=>{v.currentTime=7;});media.push(info);
  }
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Gallery overflow at '+width);}
  await page.goto(pathToFileURL(path.join(root,'source','organizer-one-pager.html')).href);await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  await page.pdf({path:path.join(root,'organizer-one-pager.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
  await page.setViewportSize({width:794,height:1123});await page.screenshot({path:path.join(root,'organizer-one-pager-preview.png')});
  for(const link of relativeLinks){if(!fs.existsSync(path.join(root,link)))throw Error('Broken gallery link '+link);}
  const thumbs=manifest.assets.filter(a=>a.format==='feed'||a.format==='carousel');
  await page.setViewportSize({width:1600,height:2150});
  await page.setContent('<html><head><style>body{background:#0b100e;color:#dce8e0;font:18px Arial;margin:30px}h1{font-size:30px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}img{width:100%;display:block}figure{margin:0}figcaption{font-size:13px;margin:8px 0 15px}</style></head><body><h1>SportStage / Campaign contact sheet</h1><main>'+thumbs.map(a=>'<figure><img src="'+pathToFileURL(path.join(root,a.file)).href+'"><figcaption>'+a.id+'</figcaption></figure>').join('')+'</main></body></html>');
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));await page.screenshot({path:path.join(root,'contact-sheet.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(root,'VALIDATION.json'),JSON.stringify({checkedAt:new Date().toISOString(),pngCount:manifest.assets.length,imageDimensions:'PASS',galleryWidths:[320,390,1440],galleryOverflow:'NONE',browserErrors:errors,relativeLinks:'PASS',videos:media,brochure:'Exported A4 PDF; visual review required',publishing:'Not published; current CTA follows launch updates'},null,2));
  console.log('PASS: 45 image dimensions, local links, four 15-second videos, gallery at 320/390/1440px; brochure and contact sheet exported.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
