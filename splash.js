(function(){
'use strict';

/* ---- settings: change these lines if your file names differ ---- */
var NEXT  = 'index.html';   // the game page
var TOTAL = 3000;           // total intro time in milliseconds
var EXIT  = 500;            // the last 500 ms are the closing transition

var stage = document.getElementById('stage');
var leaving = false, gone = false;

/* ---- title: split into letters so they can drop in one by one ---- */
var title = document.getElementById('title');
var word = title.textContent;
title.innerHTML = '';
word.split('').forEach(function(ch,i){
  var s = document.createElement('span');
  s.textContent = ch; s.style.setProperty('--i', i); s.setAttribute('aria-hidden','true');
  title.appendChild(s);
});

/* ---- tractor drawing (used twice: big red one and small blue one) ---- */
function tractor(body){
  var L = 'var(--line)', skin = '#B9794A';
  var s = '<svg class="tractor" viewBox="-80 0 300 140" aria-hidden="true"><g class="bob">';

  /* plough towed behind */
  s += '<path d="M-74 98H40V108H-74z" fill="#8A97A0" stroke="'+L+'" stroke-width="3" stroke-linejoin="round"/>';
  [-62,-44,-26,-8].forEach(function(x){
    var d = 'M'+x+' 108V122Q'+x+' 133 '+(x+11)+' 134';
    s += '<path d="'+d+'" fill="none" stroke="'+L+'" stroke-width="9" stroke-linecap="round"/>';
    s += '<path d="'+d+'" fill="none" stroke="#5B6770" stroke-width="4" stroke-linecap="round"/>';
  });

  /* driver in an orange turban, seat */
  s += '<path d="M58 64V44Q58 32 68 32Q78 32 78 44V64z" fill="#FBF3E0" stroke="'+L+'" stroke-width="2.5"/>';
  s += '<circle cx="68" cy="22" r="9" fill="'+skin+'" stroke="'+L+'" stroke-width="2.5"/>';
  s += '<path d="M59 20Q60 8 68 8Q77 8 77 20Q68 15 59 20z" fill="#F08A24" stroke="'+L+'" stroke-width="2.2" stroke-linejoin="round"/>';
  s += '<rect x="64" y="66" width="7" height="12" fill="#2B2F33"/>';
  s += '<rect x="54" y="60" width="28" height="9" rx="3" fill="#2B2F33" stroke="'+L+'" stroke-width="2"/>';

  /* body + hood */
  s += '<path d="M50 76H172Q190 76 192 90V112H50z" fill="'+body+'" stroke="'+L+'" stroke-width="3" stroke-linejoin="round"/>';
  s += '<path d="M104 85H176" stroke="rgba(255,255,255,.45)" stroke-width="3" stroke-linecap="round"/>';
  s += '<path d="M184 90V106M188 92V104" stroke="'+L+'" stroke-width="2.5" stroke-linecap="round"/>';
  s += '<circle cx="189" cy="82" r="4.5" fill="#FFE27A" stroke="'+L+'" stroke-width="2"/>';
  s += '<rect x="193" y="98" width="9" height="14" rx="2" fill="#8A97A0" stroke="'+L+'" stroke-width="2.5"/>';

  /* exhaust with smoke */
  s += '<rect x="146" y="40" width="7" height="38" rx="2" fill="#5B6770" stroke="'+L+'" stroke-width="2.5"/>';
  s += '<rect x="143" y="36" width="13" height="6" rx="2" fill="#2B2F33" stroke="'+L+'" stroke-width="2"/>';
  ['0s','.27s','.53s'].forEach(function(p){
    s += '<circle class="puff" style="--p:'+p+'" cx="149" cy="30" r="5" fill="#E8EDF0"/>';
  });

  /* rear wheel */
  s += '<g class="wheel"><circle cx="62" cy="95" r="40" fill="#2B2F33" stroke="'+L+'" stroke-width="3"/>';
  for(var a=0;a<14;a++){
    var r = a*Math.PI*2/14;
    s += '<path d="M'+(62+Math.cos(r)*33).toFixed(1)+' '+(95+Math.sin(r)*33).toFixed(1)+'L'+(62+Math.cos(r)*40).toFixed(1)+' '+(95+Math.sin(r)*40).toFixed(1)+'" stroke="#5B6770" stroke-width="4"/>';
  }
  s += '<circle cx="62" cy="95" r="22" fill="var(--sun)" stroke="'+L+'" stroke-width="3"/>';
  s += '<path d="M62 73V117M40 95H84" stroke="'+L+'" stroke-width="3"/>';
  s += '<circle cx="62" cy="95" r="6" fill="#fff" stroke="'+L+'" stroke-width="2.5"/></g>';

  /* mudguard over rear wheel */
  s += '<path d="M16 95A46 46 0 0 1 108 95" fill="none" stroke="'+L+'" stroke-width="14" stroke-linecap="round"/>';
  s += '<path d="M16 95A46 46 0 0 1 108 95" fill="none" stroke="'+body+'" stroke-width="8" stroke-linecap="round"/>';

  /* steering wheel and driver's arm */
  s += '<path d="M104 78L98 52" stroke="#2B2F33" stroke-width="4" stroke-linecap="round"/>';
  s += '<ellipse cx="98" cy="50" rx="11" ry="3.5" fill="none" stroke="#2B2F33" stroke-width="4" transform="rotate(-15 98 50)"/>';
  s += '<path d="M74 44L96 50" stroke="'+L+'" stroke-width="9" stroke-linecap="round"/>';
  s += '<path d="M74 44L96 50" stroke="#FBF3E0" stroke-width="5" stroke-linecap="round"/>';
  s += '<circle cx="98" cy="50" r="4" fill="'+skin+'" stroke="'+L+'" stroke-width="2"/>';

  /* front wheel */
  s += '<g class="wheel f"><circle cx="172" cy="113" r="22" fill="#2B2F33" stroke="'+L+'" stroke-width="3"/>';
  for(var b=0;b<10;b++){
    var q = b*Math.PI*2/10;
    s += '<path d="M'+(172+Math.cos(q)*17).toFixed(1)+' '+(113+Math.sin(q)*17).toFixed(1)+'L'+(172+Math.cos(q)*22).toFixed(1)+' '+(113+Math.sin(q)*22).toFixed(1)+'" stroke="#5B6770" stroke-width="3.5"/>';
  }
  s += '<circle cx="172" cy="113" r="12" fill="var(--sun)" stroke="'+L+'" stroke-width="2.5"/>';
  s += '<path d="M172 101V125M160 113H184" stroke="'+L+'" stroke-width="2.5"/>';
  s += '<circle cx="172" cy="113" r="4" fill="#fff" stroke="'+L+'" stroke-width="2"/></g>';

  return s + '</g></svg>';
}
Array.prototype.forEach.call(document.querySelectorAll('[data-tractor]'), function(el){
  el.innerHTML = tractor(el.getAttribute('data-tractor'));
});

/* ---- field: twelve crops that sprout just after the big tractor passes ---- */
var types = ['ragi','maize','tomato','rice'];
var heights = {ragi:56, maize:80, tomato:52, rice:64};
var field = document.getElementById('field');

function plant(x, type, delay){
  var h = heights[type], L = 'var(--line)';
  var g = '<g class="plant" style="--d:'+delay+'s" transform="translate('+x+' 148)">';
  g += '<g class="stem"><path d="M0 0V-'+h+'" stroke="'+L+'" stroke-width="9" stroke-linecap="round" fill="none"/>'
     + '<path d="M0 0V-'+h+'" stroke="var(--leaf)" stroke-width="4.5" stroke-linecap="round" fill="none"/></g>';
  g += '<g transform="translate(-9 -'+(h*.5)+') rotate(-28)"><ellipse class="leaf" rx="11" ry="4.5" fill="var(--leaf)" stroke="'+L+'" stroke-width="1.8"/></g>';
  g += '<g transform="translate(9 -'+(h*.5+7)+') rotate(28)"><ellipse class="leaf" rx="11" ry="4.5" fill="var(--leaf)" stroke="'+L+'" stroke-width="1.8"/></g>';
  g += '<g transform="translate(0 -'+h+')">';
  if(type==='ragi')   g += '<g class="top"><circle r="7" fill="#7A3E22" stroke="'+L+'" stroke-width="1.8"/><circle cx="-8" cy="6" r="5" fill="#8C4B2B" stroke="'+L+'" stroke-width="1.8"/><circle cx="8" cy="6" r="5" fill="#8C4B2B" stroke="'+L+'" stroke-width="1.8"/></g>';
  if(type==='maize')  g += '<g class="top"><ellipse cx="9" cy="12" rx="6" ry="12" fill="#F2C230" stroke="'+L+'" stroke-width="2"/></g>';
  if(type==='tomato') g += '<g class="top"><circle cx="-9" cy="14" r="7" fill="#E5483B" stroke="'+L+'" stroke-width="2"/><circle cx="9" cy="24" r="7" fill="#E5483B" stroke="'+L+'" stroke-width="2"/></g>';
  if(type==='rice')   g += '<g class="top"><path d="M0 0q14 -2 14 14" stroke="'+L+'" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M0 0q14 -2 14 14" stroke="#E2B93B" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M0 6q-12 0 -12 12" stroke="'+L+'" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M0 6q-12 0 -12 12" stroke="#E2B93B" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>';
  g += '</g></g>';
  return g;
}
var html = '';
for(var i=0;i<12;i++){
  var x = 80 + i*130;
  html += plant(x, types[i%4], (0.2 + 1.6*x/1600).toFixed(2));
}
field.insertAdjacentHTML('beforeend', html);

/* ---- status text changes four times while the bar fills ---- */
var status = document.getElementById('status');
[[0,'Reading the weather…'],[750,'Tilling the soil…'],[1500,'Opening the mandi…'],[2250,'Ready to farm!']]
.forEach(function(m){ setTimeout(function(){ if(!leaving) status.textContent = m[1]; }, m[0]); });

/* ---- hand-off to the game ---- */
function go(){ if(gone) return; gone = true; window.location.replace(NEXT); }
function leave(){
  if(leaving) return;
  leaving = true;
  stage.classList.add('leaving');
  setTimeout(go, EXIT);
}

var timer = setTimeout(leave, TOTAL - EXIT);   // closing starts at 2.5 s, page changes at 3.0 s

document.getElementById('skip').addEventListener('click', function(){ clearTimeout(timer); leave(); });
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' || e.key === 'Enter'){ clearTimeout(timer); leave(); }
});
})();
