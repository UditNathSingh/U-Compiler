// === DEPLOYMENT CONFIGURATION ===
const PRODUCTION_BACKEND_HOST = '';

// FIREBASE INITIALIZATION
const firebaseConfig = {
  apiKey: "AIzaSyB3TPHvIZwm6p810uqUTlv4uNVO_4UMxXo",
  authDomain: "ucompiler-98fca.firebaseapp.com",
  projectId: "ucompiler-98fca",
  storageBucket: "ucompiler-98fca.firebasestorage.app",
  messagingSenderId: "994373334762",
  appId: "1:994373334762:web:d26d598db1f61c9c140993"
};
firebase.initializeApp(firebaseConfig);
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

let authToken = null;
let gDriveAccessToken = null;
let ws = null;
let currentCompileStartTime = 0;

(function(){
var $=function(id){return document.getElementById(id)};
var ta=$('ta'),hl=$('hl'),gutin=$('gutin'),tb=$('tb'),tip=$('tip'),
    runBtn=$('runBtn'),toast=$('toast'),tstat=$('tstat'),tdot=$('tdot');
var tt=null;
var PLAY=runBtn.innerHTML;
var SPIN='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';

ta.value='#include <stdio.h>\n\nint main(void) {\n    // greet and credit\n    printf("Welcome to Ucompiler \\n");\n    printf("Made By UditNath Singh \\n");\n    return 0;\n}';


async function getDriveToken() {
    if (gDriveAccessToken) return gDriveAccessToken;
    if (!firebase.auth().currentUser) throw new Error("Not signed in");
    const result = await firebase.auth().signInWithPopup(googleProvider);
    if (result.credential) gDriveAccessToken = result.credential.accessToken;
    return gDriveAccessToken;
}

/* ---------- helpers ---------- */
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function showToast(m){
  toast.textContent=m;toast.hidden=false;toast.style.opacity='1';
  clearTimeout(tt);tt=setTimeout(function(){toast.style.opacity='0';setTimeout(function(){toast.hidden=true},200)},1700);
}
function guides(prefix){
  var n=Math.floor(prefix.length/4),out=esc(prefix.slice(0,4));
  for(var i=1;i<n;i++)out+='<span class="ig">    </span>';
  return out+esc(prefix.slice(n*4));
}
function hlLine(s){
  var m=s.match(/^(\s*)/),lead=m?m[0]:'';
  var rest=esc(s.slice(lead.length));
  rest=rest.replace(/(\/\/.*)|("(?:[^"\\]|\\.)*"?)|(#[a-zA-Z]+)|\b(int|void|char|return|if|else|for|while|sizeof|float|double|long|short|unsigned|struct|define|include)\b|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*(?=\s*\())/g,
   function(mm,com,st,pre,kw,num,fn){
    if(com)return '<span class="tk-com">'+com+'</span>';
    if(st)return '<span class="tk-str">'+st+'</span>';
    if(pre)return '<span class="tk-pre">'+pre+'</span>';
    if(kw)return '<span class="tk-kw">'+kw+'</span>';
    if(num)return '<span class="tk-num">'+num+'</span>';
    if(fn)return '<span class="tk-fn">'+fn+'</span>';
    return mm;
   });
  rest=rest.replace(/(&lt;[a-zA-Z0-9./_]+&gt;)/g,'<span class="tk-inc">$1</span>');
  return guides(lead)+rest;
}
function analyze(src){
  var errs=[];
  src.split('\n').forEach(function(l,i){
    var t=l.trim();
    if(!t)return;
    if(t.indexOf('//')===0||t[0]==='#')return;
    if(t==='{'||t.slice(-1)==='{')return;
    if(t.slice(-1)!==';'&&t.slice(-1)!=='}')errs.push({line:i+1,msg:"expected ';' before end of line"});
  });
  return errs;
}

/* ---------- render ---------- */
function sync(){
  var st=ta.scrollTop,sl=ta.scrollLeft;
  hl.style.transform='translate('+(-sl)+'px,'+(-st)+'px)';
  gutin.style.transform='translateY('+(-st)+'px)';
}
function refresh(){
  var src=ta.value,errs=analyze(src);
  var lines=src.split('\n'),h='',g='';
  for(var i=0;i<lines.length;i++){
    var ln=i+1,l=hlLine(lines[i]);
    var err=errs.filter(function(e){return e.line===ln})[0];
    if(err)l='<span class="tk-errl">'+(l||' ')+'</span>';
    h+=(l||' ')+'\n';
    g+='<div class="gnum">'+(err?'<span class="gerr" data-ln="'+ln+'" title="Quick fix: insert \';\'"></span>':'')+ln+'</div>';
  }
  hl.innerHTML=h;gutin.innerHTML=g;sync();
}
gutin.addEventListener('click',function(e){
  var d=e.target.closest?e.target.closest('.gerr'):null;
  if(!d)return;
  var n=+d.getAttribute('data-ln'),lines=ta.value.split('\n');
  if(lines[n-1].slice(-1)!==';'){lines[n-1]+=';';ta.value=lines.join('\n');refresh();showToast("Inserted ';' at line "+n)}
});
ta.addEventListener('input',refresh);
ta.addEventListener('scroll',sync);
ta.addEventListener('keydown',function(e){
  if(e.key==='Tab'){e.preventDefault();
    var s=ta.selectionStart;
    ta.value=ta.value.slice(0,s)+'    '+ta.value.slice(ta.selectionEnd);
    ta.selectionStart=ta.selectionEnd=s+4;refresh();
  }
});
ta.addEventListener('mousemove',function(e){
  var y=e.offsetY-12+ta.scrollTop,ln=Math.floor(y/21)+1;
  var er=analyze(ta.value).filter(function(x){return x.line===ln})[0];
  if(er){tip.hidden=false;tip.textContent='main.c:'+ln+'  '+er.msg;tip.style.top=(12+(ln-1)*21-ta.scrollTop)+'px'}
  else tip.hidden=true;
});
ta.addEventListener('mouseleave',function(){tip.hidden=true});

/* ---------- terminal and websocket ---------- */
function connectWebSocket() {
    return new Promise((resolve, reject) => {
        let wsUrl;
        if (PRODUCTION_BACKEND_HOST) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${PRODUCTION_BACKEND_HOST}`;
        } else {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}`;
        }

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            if (authToken) {
                ws.send(JSON.stringify({ type: 'auth', token: authToken }));
            } else {
                ws.send(JSON.stringify({ type: 'auth', token: 'anonymous' }));
            }
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if(msg.type === 'auth_success') {
                resolve(msg.email);
            } else if (msg.type === 'auth_error') {
                term.writeln(`\r\n\x1b[31mAuth Failed: ${msg.message}\x1b[0m`);
                reject();
            } else if (msg.type === 'output') {
                term.write(msg.data);
            } else if (msg.type === 'process_ended') {
                const duration = ((Date.now() - currentCompileStartTime) / 1000).toFixed(2);
                done('\r\n\x1b[32mProcess returned in ' + duration + 's\x1b[0m');
            }
        };

        ws.onclose = () => { ws = null; done(); };
        ws.onerror = () => { term.writeln('\r\n\x1b[31mWebSocket Error\x1b[0m'); done(); reject(); };
    });
}

const term = new Terminal({
  cursorBlink: true,
  theme: { background: 'transparent', foreground: '#E6EDF3', cursor: '#C9D1D9', green: '#3FB950', red: '#FF7B72', cyan: '#39C5CF', yellow: '#D29922' },
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

setTimeout(() => {
    $('tb').innerHTML = '';
    $('tb').style.overflow = 'hidden';
    term.open($('tb'));
    fitAddon.fit();
    term.writeln('\x1b[33m[LOCKED] Please sign in with Google to unlock compiling.\x1b[0m');
}, 100);

window.addEventListener('resize', () => {
    fitAddon.fit();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
});

term.onData(data => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: data }));
    }
});

function done(msg){
  tstat.textContent='ready';
  tdot.style.background='var(--green)';
  runBtn.disabled=false;
  runBtn.classList.remove('busy');
  runBtn.innerHTML=PLAY;
  if(msg) term.write(msg);
}

async function doRun(){
  if(runBtn.innerHTML.includes('Stop')) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
      done();
      return;
  }
  if(runBtn.disabled) return;
  var src=ta.value;
  runBtn.disabled=true;runBtn.classList.add('busy');runBtn.innerHTML=SPIN+'<span class="blabel">Run</span>';
  tstat.textContent='running';tdot.style.background='var(--red)';
  term.clear();
  currentCompileStartTime = Date.now();

  try {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
          await connectWebSocket();
      }
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      ws.send(JSON.stringify({ type: 'run', code: src }));

      setTimeout(() => {
          runBtn.disabled = false;
          runBtn.innerHTML = SPIN + '<span class="blabel">Stop</span>';
      }, 500);

  } catch (err) {
      term.writeln('\r\n\x1b[31mConnection failed. Ensure server is running.\x1b[0m');
      done();
  }
}
runBtn.onclick=doRun;
document.addEventListener('keydown',function(e){if(e.key==='F5'){e.preventDefault();doRun()}});
$('clearBtn').onclick=function(){ term.clear(); };

/* ---------- header buttons ---------- */
$('fileNameInput').addEventListener('input', function() {
  if (document.getElementById('fileNameDisplay')) {
      document.getElementById('fileNameDisplay').innerText = this.innerText;
  }
});
$('fileNameInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
});

$('formatBtn').onclick=function(){
  ta.value=ta.value.split('\n').map(function(l){return l.replace(/\s+$/,'')}).join('\n');
  refresh();showToast('Formatted ' + $('fileNameInput').innerText);
};

$('saveBtn').onclick=async function(){
  try {
      const token = await getDriveToken();
      const filename = $('fileNameInput').innerText.trim() || 'main.c';
      showToast('Saving to Drive...');
      
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`, {
          headers: { Authorization: `Bearer ${token}` }
      });
      const searchData = await searchRes.json();
      
      const content = ta.value;
      const uploadUrl = 'https://upload.googleapis.com/upload/drive/v3/files';
      
      if (searchData.files && searchData.files.length > 0) {
          const fileId = searchData.files[0].id;
          await fetch(`${uploadUrl}/${fileId}?uploadType=media`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
              body: content
          });
      } else {
          const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: filename, mimeType: 'text/plain' })
          });
          const metaData = await metaRes.json();
          await fetch(`${uploadUrl}/${metaData.id}?uploadType=media`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
              body: content
          });
      }
      showToast(`Saved ${filename} to Google Drive!`);
  } catch (e) {
      console.error(e);
      showToast('Saving failed. Please log in.');
  }
};

$('importBtn').onclick=async function(){
  try {
      const token = await getDriveToken();
      const filename = $('fileNameInput').innerText.trim() || 'main.c';
      showToast('Searching Drive...');
      
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false`, {
          headers: { Authorization: `Bearer ${token}` }
      });
      const searchData = await searchRes.json();
      
      if (searchData.files && searchData.files.length > 0) {
          const fileId = searchData.files[0].id;
          const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
              headers: { Authorization: `Bearer ${token}` }
          });
          const text = await fileRes.text();
          ta.value = text;
          refresh();
          showToast(`Imported ${filename} from Drive`);
      } else {
          showToast(`${filename} not found in your Drive.`);
      }
  } catch (e) {
      console.error(e);
      showToast('Import failed. Please log in.');
  }
};

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        user.getIdToken().then(token => {
            authToken = token;
            const firstName = user.displayName.split(' ')[0];
            $('loginBtn').hidden = true;
            $('logoutBtn').hidden = false;
            term.clear();
            term.writeln('\x1b[32m[SYSTEM] Authenticated as ' + user.email + '\x1b[0m');
        });
    } else {
        authToken = null;
        $('loginBtn').hidden = false;
        $('logoutBtn').hidden = true;
        term.writeln('\r\n\x1b[33m[LOCKED] Please sign in with Google to unlock compiling.\x1b[0m');
    }
});

$('loginBtn').onclick=async function(){
    try {
        const result = await firebase.auth().signInWithPopup(googleProvider);
        if (result.credential && result.credential.accessToken) {
            gDriveAccessToken = result.credential.accessToken;
        }
        const firstName = result.user.displayName.split(' ')[0];
        showToast('Signed in as ' + firstName);
    } catch (error) {
        console.error(error);
        term.writeln('\r\n\x1b[31mGoogle Sign-In failed or was cancelled.\x1b[0m');
    }
};

$('logoutBtn').onclick=function(){
    firebase.auth().signOut().then(() => {
        showToast('Signed out');
    });
};

refresh();
})();