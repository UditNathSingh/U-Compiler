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
var tb=$('tb'),
    runBtn=$('runBtn'),toast=$('toast'),tstat=$('tstat'),tdot=$('tdot');
var tt=null;
var PLAY=runBtn.innerHTML;
var SPIN='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';

// Ace Editor Setup
var editorInst = ace.edit("editor");
editorInst.setTheme("ace/theme/tomorrow_night");
editorInst.session.setMode("ace/mode/c_cpp");
editorInst.setOptions({
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    showPrintMargin: false,
    useSoftTabs: true,
    tabSize: 4
});
editorInst.setValue('#include <stdio.h>\n\nint main(void) {\n    // greet and credit\n    printf("Welcome to Ucompiler \\n");\n    printf("Made By UditNath Singh \\n");\n    return 0;\n}', -1);
editorInst.setReadOnly(true);


async function getDriveToken() {
    if (gDriveAccessToken) return gDriveAccessToken;
    if (!firebase.auth().currentUser) throw new Error("Not signed in to Firebase");
    
    // Try to get token via popup
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        const result = await firebase.auth().signInWithPopup(provider);
        if (result.credential && result.credential.accessToken) {
            gDriveAccessToken = result.credential.accessToken;
            return gDriveAccessToken;
        }
        throw new Error("No access token provided by Google");
    } catch(err) {
        throw new Error("Popup blocked or sign-in failed. Click 'Sign out' then 'Sign in' again.");
    }
}

/* ---------- helpers ---------- */
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function showToast(m){
  toast.textContent=m;toast.hidden=false;toast.style.opacity='1';
  clearTimeout(tt);tt=setTimeout(function(){toast.style.opacity='0';setTimeout(function(){toast.hidden=true},200)},1700);
}

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
    editorInst.resize();
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
  if (!authToken) {
      showToast("Please sign in to compile code");
      return;
  }
  var src=editorInst.getValue();
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
  editorInst.setValue(editorInst.getValue().split('\n').map(function(l){return l.replace(/\s+$/,'')}).join('\n'), -1);
  showToast('Formatted ' + $('fileNameInput').innerText);
};

$('saveBtn').onclick=async function(){
  try {
      const token = await getDriveToken();
      const filename = $('fileNameInput').innerText.trim() || 'main.c';
      const originalHTML = $('saveBtn').innerHTML;
      $('saveBtn').innerHTML = SPIN + '<span class="blabel">Saving...</span>';
      
            const q = encodeURIComponent(`name='${filename}' and trashed=false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { Authorization: `Bearer ${token}` }
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(searchData.error?.message || "Failed to search Drive");

      const content = editorInst.getValue();
      const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files';
      
      if (searchData.files && searchData.files.length > 0) {
          const fileId = searchData.files[0].id;
          const uRes = await fetch(`${uploadUrl}/${fileId}?uploadType=media`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
              body: content
          });
          if(!uRes.ok) { let errTxt = await uRes.text(); throw new Error("Update error " + uRes.status + ": " + errTxt); }
      } else {
          const boundary = "ucompiler_boundary_xyz";
          const body = "--" + boundary + "\r\n"
                     + "Content-Type: application/json; charset=UTF-8\r\n\r\n"
                     + JSON.stringify({ name: filename, mimeType: "text/plain" }) + "\r\n"
                     + "--" + boundary + "\r\n"
                     + "Content-Type: text/plain\r\n\r\n"
                     + content + "\r\n"
                     + "--" + boundary + "--";

          const uRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
              method: "POST",
              headers: { 
                  "Authorization": `Bearer ${token}`, 
                  "Content-Type": `multipart/related; boundary=${boundary}` 
              },
              body: body
          });
          if(!uRes.ok) { let errTxt = await uRes.text(); throw new Error("Upload error " + uRes.status + ": " + errTxt); }
      }

      $('saveBtn').innerHTML = '<span class="blabel" style="color:var(--green)">✔ Saved</span>';
      setTimeout(() => { document.getElementById('saveBtn').innerHTML = originalHTML; }, 2000);
      showToast(`Saved ${filename}`);
  } catch (e) {
      console.error(e);
      document.getElementById('saveBtn').innerHTML = '<span class="blabel" style="color:var(--red)">X Error</span>';
      setTimeout(() => { document.getElementById('saveBtn').innerHTML = '<span class="blabel">Save</span>'; }, 2000);
      showToast(e.message || 'Saving failed. Please log in.');
  }
};

$('importBtn').onclick=async function(){
  try {
      const token = await getDriveToken();
      const originalHTML = $('importBtn').innerHTML;
      $('importBtn').innerHTML = SPIN + '<span class="blabel">Loading...</span>';
      
      const qParams = 'q=' + encodeURIComponent('trashed=false') + '&orderBy=' + encodeURIComponent('modifiedTime desc');
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?${qParams}`, {
          headers: { Authorization: `Bearer ${token}` }
      });
      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(searchData.error?.message || "Failed to list files");
      $('importBtn').innerHTML = originalHTML;
      
      if (searchData.files && searchData.files.length > 0) {
          
          if ($('importModal')) $('importModal').remove();
          if (!$('importModal')) {
              const div = document.createElement('div');
              div.id = 'importModal';
              div.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:999999; align-items:center; justify-content:center;';
              div.innerHTML = `<div style="background:var(--bg2); border:1px solid var(--line); padding:24px; border-radius:12px; width:300px; box-shadow:0 20px 50px rgba(0,0,0,0.8);">
                     <h3 style="margin:0 0 16px 0; font-weight:500; font-size:16px; color:var(--t1);">Import from Google Drive</h3>
                     <select id="importSelect" style="width:100%; padding:10px; margin-bottom:20px; background:var(--bg4); color:var(--t1); border:1px solid var(--line); border-radius:6px; outline:none; font-family:var(--font-sans); appearance:auto; -webkit-appearance:auto;"></select>
                     <div style="display:flex; justify-content:flex-end; gap:8px;">
                         <button class="btn ghost" id="importCancelBtn" style="color:var(--t2);">Cancel</button>
                         <button class="btn primary" id="importConfirmBtnDynamic" style="color:var(--bg);">Import</button>
                     </div>
                  </div>`;
              document.querySelector('.ide').appendChild(div);
              
              $('importCancelBtn').onclick = () => $('importModal').style.display = 'none';
              $('importConfirmBtnDynamic').onclick = async function() {
                  const fileId = $('importSelect').value;
                  const filename = $('importSelect').options[$('importSelect').selectedIndex].text;
                  if (!fileId) return;
                  
                  try {
                      const token = await getDriveToken();
                      $('importConfirmBtnDynamic').innerHTML = 'Downloading...';
                      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                          headers: { Authorization: `Bearer ${token}` }
                      });
                      if (!fileRes.ok) throw new Error("Failed to download file");
                      const text = await fileRes.text();
                      editorInst.setValue(text, -1);

                      const fnInput = document.getElementById('fileNameInput');
                      if (fnInput) fnInput.innerText = filename;
                      const fnDisplay = document.getElementById('fileNameDisplay');
                      if (fnDisplay) fnDisplay.innerText = filename;
                      
                      $('importModal').style.display = 'none';
                      $('importConfirmBtnDynamic').innerHTML = 'Import';
                      showToast(`Imported ${filename}`);
                  } catch (e) {
                      showToast(e.message || 'Download failed.');
                      $('importConfirmBtnDynamic').innerHTML = 'Import';
                  }
              };
          }

          const select = $('importSelect');
          select.innerHTML = '';
          searchData.files.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f.id;
              opt.textContent = f.name; opt.style.color = "white"; opt.style.background = "black";
              select.appendChild(opt);
          });
          $('importModal').style.display = 'flex';
      } else {
          showToast('No files found in your Drive.');
      }
  } catch (e) {
      console.error(e);
      document.getElementById('importBtn').innerHTML = '<span class="blabel">Import</span>';
      showToast(e.message || 'Import failed. Please log in.');
  }
};

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        user.getIdToken().then(token => {
            authToken = token;
            editorInst.setReadOnly(false);
            const firstName = user.displayName.split(' ')[0];
            $('loginBtn').hidden = true;
            $('logoutBtn').hidden = false;
            term.clear();
            term.writeln('\x1b[32m[SYSTEM] Authenticated as ' + user.email + '\x1b[0m');
        });
    } else {
        authToken = null;
        editorInst.setReadOnly(true);
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

})();