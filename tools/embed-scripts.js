// Keep the complete runtime in one HTML response to prevent cross-version cache mixes.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [id,file] of [['ccc-engine','csv-engine.js'],['ccc-ui','csv-ui.js']]){
 const code=fs.readFileSync(path.join(root,file),'utf8');if(/<\/script/i.test(code))throw Error('Unsafe closing script tag in '+file);
 const re=new RegExp('(<script id="'+id+'"[^>]*>)[\\s\\S]*?(<\\/script>)');if(!re.test(html))throw Error('Missing script marker '+id);
 html=html.replace(re,(_,open,close)=>open+'\n'+code+'\n'+close);
}
fs.writeFileSync(path.join(root,'index.html'),html);
