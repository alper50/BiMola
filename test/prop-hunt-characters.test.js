import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTERS, DEFAULT_CHARACTER, validCharacter} from '../public/platform/characters.js';
import {player, start, view, syncBots, sanitizeSettings} from '../server/games/prop-hunt/game.js';
import {adapter} from '../server/games/prop-hunt/adapter.js';
import {OUTFITS, hasOutfit, buildSkin} from '../public/games/prop-hunt/outfits.js';

// Kıyafet geometrisini üretim kurucusuyla, tarayıcı veya WebGL olmadan sınar: map-models.test.js
// bunu three.js saplamasıyla yapıyor, burada çizilen her parçayı kaydeden düz bir bağlam yeter.
// Ölçüler avatar() ile aynı eksende: y yerden yukarı metre, z ileri doğru negatif.
function context(){
 const parts=[],palette={},m=new Proxy(palette,{get:(store,key)=>store[key]||(store[key]={name:String(key)})});
 const g={id:'avatar'};
 const add=(kind,w,h,d,x,y,z,material,parent)=>{
  assert.ok(material&&material.name,`${kind}: her parça bir malzeme alır`);
  assert.equal(parent,g,`${kind}: parça avatar grubuna eklenmeli, varsayılan sahneye değil`);
  assert.ok([w,h,d,x,y,z].every(Number.isFinite),`${kind}: bütün ölçüler sonlu olmalı`);
  const part={kind,w,h,d,x,y,z,material:material.name,rotation:{x:0,y:0,z:0}};parts.push(part);return part;
 };
 return {m,g,parts,
  box:(w,h,d,x,y,z,mat,parent)=>add('box',w,h,d,x,y,z,mat,parent),
  round:(w,h,d,r,x,y,z,mat,parent)=>add('round',w,h,d,x,y,z,mat,parent),
  cyl:(rt,rb,h,x,y,z,mat,parent)=>add('cyl',Math.max(rt,rb)*2,h,Math.max(rt,rb)*2,x,y,z,mat,parent),
  sphere:(r,x,y,z,mat,parent,sx=1,sy=1,sz=1)=>add('sphere',r*2*sx,r*2*sy,r*2*sz,x,y,z,mat,parent),
  torus:(r,t,x,y,z,mat,parent)=>add('torus',(r+t)*2,t*2,(r+t)*2,x,y,z,mat,parent),
  // rod iki nokta arasına uzanır: kutusu kalınlığı kadar geniş, uzunluğu kadar yüksek sayılır.
  rod:(a,b,r,mat,parent)=>add('rod',r*2,Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),r*2,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,mat,parent),
 };
}
const built=id=>{const c=context();return {style:buildSkin(c,id,c.g),parts:c.parts};};

test('Nesne Avı kıyafetleri ortak katalogda seçilebilir; diğer karakterler kıyafet çizmez', () => {
  for (const id of OUTFITS) assert.ok(validCharacter(id) && hasOutfit(id), id);
  for (const c of CHARACTERS.filter(c => !OUTFITS.includes(c.id))) assert.equal(built(c.id).style, null, c.id);
});

test('her karakter insan ölçeğinde sonlu geometri kurar, tanınmayan ad hiç çizmez',()=>{
 for(const id of OUTFITS){
  const {style,parts}=built(id);
  assert.ok(style,id);
  assert.ok(style.shirt?.name&&style.pants?.name,`${id}: gövde ve pantolon malzemesi bildirmeli`);
  assert.ok(parts.length>=3,`${id}: en az üç parça`);
  for(const part of parts){
   assert.ok(Math.abs(part.x)+part.w/2<=.45,`${id}/${part.kind}: gövde genişliğini aşıyor`);
   assert.ok(Math.abs(part.z)+part.d/2<=.45,`${id}/${part.kind}: gövde derinliğini aşıyor`);
   assert.ok(part.y-part.h/2>=0&&part.y+part.h/2<=2.1,`${id}/${part.kind}: y ${part.y} oda dışına taşıyor`);
  }
 }
 const unknown=built('sahte');
 assert.equal(unknown.style,null);
 assert.equal(unknown.parts.length,0);
});

test('dört karakter birbirinden gerçekten ayrılır ve hepsi takım rengini taşır',()=>{
 const signatures=OUTFITS.map(id=>{
  const {parts}=built(id);
  // Takım rengi (teal) her karakterde bir aksesuar olarak durur: avcı uzaktan avcı gibi okunsun.
  assert.ok(parts.some(part=>part.material==='teal'),`${id}: takım rengi aksesuarı yok`);
  return JSON.stringify(parts);
 });
 assert.equal(new Set(signatures).size,OUTFITS.length,'iki karakter aynı kıyafeti çizmemeli');
});

test('kıyafet katmanı yüz bölgesine hiç dokunmaz: baş ve yüz dört karakterde de aynı kalır',()=>{
 // avatar() gözleri 1.63 m'de, burnu 1.586 m'de, ağzı 1.55 m'de çizer ve bunları hiçbir karakter
 // için değiştirmez. Ayrım giyimden gelsin diye yüzün önü kıyafet katmanına kapalıdır; çeneyi
 // saran sakal 1.56 m'nin altında kalır. Buraya bir parça eklenirse bu test bilinçli düşmeli.
 for(const id of OUTFITS)for(const part of built(id).parts){
  const onTheFace=part.y>=1.56&&part.y<=1.72&&part.z<-.02&&Math.abs(part.x)<.13;
  assert.equal(onTheFace,false,`${id}: ${part.kind} yüzün önüne yerleşmiş (y ${part.y}, z ${part.z})`);
 }
});



test('oyuncu ortak BiMola karakteriyle girer, geçersiz ad varsayılana düşer', () => {
  assert.equal(player('a', 'Ada').character, DEFAULT_CHARACTER);
  assert.equal(player('a', 'Ada', false, 'hunter', 'limon').character, 'limon');
  assert.equal(player('a', 'Ada', false, 'hunter', 'levi').character, 'levi', 'eski Nesne Avı karakterleri de seçilebilir');
  for (const bad of ['sahte', 'LEVI', null, undefined, 42, {id: 'limon'}, ['limon'], '__proto__']) assert.equal(player('a', 'Ada', false, 'hunter', bad).character, DEFAULT_CHARACTER);
});

test('karakter her pakette gider, tur sıfırlamasını ve takım değişimini atlatır', () => {
  const r = {code: 'TEST', host: 'a', phase: 'lobby', settings: sanitizeSettings({teamSize: 1, botMode: 'off', swapTeams: true, mapRotate: false}),
    players: {a: player('a', 'Avcı', false, 'hunter', 'gece'), b: player('b', 'Saklanan', false, 'hider', 'tarcin')}};
  assert.ok(start(r, 1000).ok);
  const packet = view(r, 'a', 2000), hider = packet.players.find(p => p.id === 'b');
  assert.equal(packet.players.find(p => p.id === 'a').character, 'gece');
  // Kozmetik bir alan: saklananın yeri gizli kalırken görünümü ad gibi bilinebilir.
  assert.equal(hider.character, 'tarcin'); assert.equal(hider.x, undefined);
  r.phase = 'end'; assert.ok(start(r, 5000).ok);
  assert.equal(r.players.a.team, 'hider'); assert.equal(r.players.a.character, 'gece');
  assert.equal(r.players.b.team, 'hunter'); assert.equal(r.players.b.character, 'tarcin');
});

test('adaptör platformun doğruladığı karakteri kullanır ve sonradan değiştirir; botlar katalogda dolaşır', () => {
  const r = adapter.create({code: '1234', host: 'a', data: {settings: {teamSize: 3, botMode: 'fill'}}});
  adapter.addPlayer(r, {id: 'a', name: 'Ada', character: 'cam', data: {role: 'hunter'}});
  assert.equal(r.players.a.character, 'cam');
  assert.ok(adapter.setCharacter(r, 'a', 'lokum').ok); assert.equal(r.players.a.character, 'lokum');
  assert.ok(adapter.setCharacter(r, 'yok', 'lokum').error);
  syncBots(r);
  const bots = Object.values(r.players).filter(p => p.bot);
  assert.ok(bots.length >= 3 && bots.every(p => validCharacter(p.character)));
  assert.ok(new Set(bots.filter(p => p.team === 'hider').map(p => p.character)).size > 1, 'aynı takımdaki botlar aynı karakterin kopyası olmaz');
  assert.ok(adapter.setCharacter(r, bots[0].id, 'cam').error, 'botların karakteri dışarıdan değişmez');
  assert.equal(CHARACTERS.length >= 4, true);
});
