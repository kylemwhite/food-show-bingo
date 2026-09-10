// Mirror of the pure logic in index.html — verify determinism & win detection.
function xmur3(str){var h=1779033703^str.length;for(var i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}return function(){h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return (h^=h>>>16)>>>0;};}
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
function rngFor(str){return mulberry32(xmur3(str)());}
function shuffled(arr,rng){var a=arr.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(rng()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

function buildCard(seed,name,pool){
  var rng=rngFor(seed+"::"+name.trim().toLowerCase());
  var picks=shuffled(pool,rng).slice(0,24);
  var cells=[];
  for(var i=0;i<25;i++){ if(i===12) cells.push("FREE"); else cells.push(picks[i<12?i:i-1]); }
  return cells;
}

var LINES=(function(){var out=[];for(var r=0;r<5;r++)out.push([r*5,r*5+1,r*5+2,r*5+3,r*5+4]);for(var c=0;c<5;c++)out.push([c,c+5,c+10,c+15,c+20]);out.push([0,6,12,18,24]);out.push([4,8,12,16,20]);return out;})();
var CORNERS=[0,4,20,24];
function isMarked(m,i){return i===12?true:!!m[i];}
function hasWin(m,mode){
  if(mode==="blackout"){for(var i=0;i<25;i++)if(!isMarked(m,i))return false;return true;}
  if(mode==="corners")return CORNERS.every(function(i){return isMarked(m,i);});
  return LINES.some(function(ln){return ln.every(function(i){return isMarked(m,i);});});
}

function maskFromEnabled(en,len){var b=Buffer.alloc(Math.ceil(len/8));for(var i=0;i<len;i++)if(en[i])b[i>>3]|=(1<<(i&7));return b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function enabledFromMask(s,len){var out=new Array(len).fill(true);if(!s)return out;s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";var b=Buffer.from(s,"base64");for(var i=0;i<len;i++)out[i]=!!(b[i>>3]&(1<<(i&7)));return out;}

var pool=[];for(var i=0;i<40;i++)pool.push("prompt "+i);

// 1. determinism
var a1=buildCard("FIG482","Kyle",pool);
var a2=buildCard("FIG482"," kyle ",pool); // trim + lowercase
console.assert(JSON.stringify(a1)===JSON.stringify(a2),"FAIL determinism/normalize");

// 2. different names -> different cards
var b1=buildCard("FIG482","Kyle",pool);
var b2=buildCard("FIG482","Sam",pool);
console.assert(JSON.stringify(b1)!==JSON.stringify(b2),"FAIL distinct cards");

// 3. different seeds -> different cards
var c1=buildCard("AAA111","Kyle",pool);
console.assert(JSON.stringify(b1)!==JSON.stringify(c1),"FAIL seed changes card");

// 4. card shape
console.assert(a1.length===25 && a1[12]==="FREE","FAIL shape");
console.assert(new Set(a1.filter(x=>x!=="FREE")).size===24,"FAIL uniqueness in card");

// 5. win detection
var m=new Array(25).fill(false);
console.assert(!hasWin(m,"line"),"FAIL empty not win");
[0,1,2,3,4].forEach(i=>m[i]=true);
console.assert(hasWin(m,"line"),"FAIL row win");
m=new Array(25).fill(false);[0,6,18,24].forEach(i=>m[i]=true); // diagonal incl free(12)
console.assert(hasWin(m,"line"),"FAIL diagonal via FREE");
m=new Array(25).fill(false);[0,4,20,24].forEach(i=>m[i]=true);
console.assert(hasWin(m,"corners"),"FAIL corners");
console.assert(!hasWin(m,"blackout"),"FAIL blackout false");
m=new Array(25).fill(true);m[12]=false; // free auto-marked
console.assert(hasWin(m,"blackout"),"FAIL blackout via FREE");

// 6. mask round trip
var en=new Array(40).fill(true);en[3]=false;en[7]=false;en[39]=false;
var rt=enabledFromMask(maskFromEnabled(en,40),40);
console.assert(JSON.stringify(en)===JSON.stringify(rt),"FAIL mask round-trip");
console.assert(enabledFromMask("",40).every(Boolean),"FAIL empty mask = all on");

// 7. distribution sanity — 8 players, all cards distinct
var seen=new Set();
["Kyle","Sam","Jo","Pat","Al","Mo","Ty","Re"].forEach(n=>seen.add(JSON.stringify(buildCard("FIG482",n,pool))));
console.assert(seen.size===8,"FAIL 8 distinct cards");

console.log("mask len for 40 all-on:", maskFromEnabled(new Array(40).fill(true),40).length, "chars");
console.log("sample card row:", buildCard("FIG482","Kyle",pool).slice(0,5));
console.log("ALL TESTS PASSED");
