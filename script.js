// 🌐 Config
const sheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTA2O4M1ltvZh8y3ywbkFwsdn1nWUgYPUy3S5HVzS7FD8eWeJVA9OqR0k2AjiQ-MdPpg86KYj0yvbJ2/pub?output=csv';
const submitURL = 'https://script.google.com/macros/s/AKfycbwZEfuBTEJQ_2lkYw5SmERWd-7ZNmJ32UuLwWnAozyzR1Hfm_MNwmhLZlKvSIE8RWqfog/exec'; // Deploy your Apps Script Web App here

// ⌛ Limits & State
const vacationLimit = 6;
const motLimit = 2;
let mode = 'vacation';
let vacationPicks = [];
let motPicks = [];
let firefighters = [];
let currentUser = null;

// 📦 DOM
const selUser     = document.getElementById('userSelect');
const welcomeMsg  = document.getElementById('welcomeMsg');
const modeBtnVac  = document.getElementById('modeVacation');
const modeBtnMOT  = document.getElementById('modeMOT');
const submitBtn   = document.getElementById('submitBtn');
const calContainer = document.getElementById('calendar');

// 🚫 Blocked Vacation Dates
const blockedVacationDates = ['2025-12-25','2025-11-27'];

// 📅 Month Grid Info
const monthRanges = [
  {name:'August 2025',   start:'2025-08-01', end:'2025-08-31'},
  {name:'September 2025',start:'2025-09-01', end:'2025-09-30'},
  {name:'October 2025',  start:'2025-10-01', end:'2025-10-31'},
  {name:'November 2025', start:'2025-11-01', end:'2025-11-30'},
  {name:'December 2025', start:'2025-12-01', end:'2025-12-31'},
  {name:'January 2026',  start:'2026-01-01', end:'2026-01-31'}
];

// 🔄 Load Roster & Populate Dropdown
async function loadRoster() {
  const res = await fetch(sheetURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, {header:true, skipEmptyLines:true});
  firefighters = parsed.data
    .filter(r => r['Full Name'] && r.Shift && r.Email)
    .map(r => ({
      name: r['Full Name'].trim(),
      email: r.Email.trim(),
      shift: r.Shift.trim().toUpperCase(),
      seniority: parseInt(r['Seniority Rank'],10)
    }));
  selUser.innerHTML = '<option value="">-- Choose your name --</option>';
  firefighters
    .sort((a,b)=> a.seniority - b.seniority)
    .forEach(f => {
      const o = document.createElement('option');
      o.value = f.name;
      o.textContent = f.name;
      selUser.appendChild(o);
    });
}

// 📆 Shift cycle logic (48/96)
function getShiftForDay(idx) {
  const cycle = ['A','A','B','B','C','C'];
  return cycle[idx % cycle.length];
}

// 🤔 Check if it's currentUser's turn
async function checkSeniorityTurn() {
  welcomeMsg.textContent = 'Checking turn…';
  const peers = firefighters
    .filter(f => f.shift === currentUser.shift)
    .sort((a,b)=> a.seniority - b.seniority);

  try {
    const resp = await fetch(submitURL + '?action=list', {mode:'cors'});
    const done = await resp.json(); // Already submitted names
    const next = peers.find(f => !done.includes(f.name));

    if (!next) {
      disableUI(`✅ All picks done for Shift ${currentUser.shift}`);
    } else if (next.name !== currentUser.name) {
      disableUI(`🕒 Not your turn yet — it's ${next.name}'s turn.`);
    } else {
      enableUI();
      welcomeMsg.textContent = `📣 It’s your turn, ${currentUser.name}!`;
    }
  } catch (err) {
    console.error(err);
    disableUI('⚠️ Error checking turn. Try again later.');
  }
}

// 📴 UI control helpers
function disableUI(msg) {
  modeBtnVac.disabled = modeBtnMOT.disabled = submitBtn.disabled = true;
  welcomeMsg.textContent = msg;
}

function enableUI() {
  modeBtnVac.disabled = modeBtnMOT.disabled = false;
  updateModeUI();
}

// 🛠 Update VISUAL Counts & Button State
function updateModeUI() {
  modeBtnVac.classList.toggle('active', mode === 'vacation');
  modeBtnMOT.classList.toggle('active', mode === 'mot');
  modeBtnVac.textContent = `Vacation (${vacationPicks.length}/${vacationLimit})`;
  modeBtnMOT.textContent = `MOT Tours (${motPicks.length / 2}/${motLimit})`;
  submitBtn.disabled = !(motPicks.length / 2 === motLimit);
}

// 🎨 Clear previous selections of the active mode
function clearModeVisuals() {
  const cls = mode === 'vacation' ? 'selected-vacation' : 'selected-mot';
  document.querySelectorAll(`.day.${cls}`).forEach(e => {
    e.classList.remove(cls, 'selected');
  });
}

// ⚠ Clicking days
function handlePick(div, idx) {
  const date = div.dataset.date;
  const shift = div.dataset.shift;

  if (mode === 'vacation') {
    if (vacationPicks.includes(date)) {
      vacationPicks = vacationPicks.filter(d => d !== date);
      div.classList.remove('selected-vacation','selected');
    } else if (vacationPicks.length < vacationLimit) {
      vacationPicks.push(date);
      div.classList.add('selected-vacation','selected');
    } else return shake(div);

  } else {
    const next = calContainer.querySelector(`[data-global-index="${idx+1}"]`);
    const valid = {A:'BC', B:'CA', C:'AB'}[currentUser.shift];
    if (!next || shift + next.dataset.shift !== valid) return shake(div);

    [div, next].forEach(el => {
      const dt = el.dataset.date;
      if (motPicks.includes(dt)) {
        motPicks = motPicks.filter(d => d !== dt);
        el.classList.remove('selected-mot','selected');
      } else if (motPicks.length < motLimit * 2) {
        motPicks.push(dt);
        el.classList.add('selected-mot','selected');
      } else shake(el);
    });
  }

  updateModeUI();
}

// 🔴 Visual shake for invalid click
function shake(div) {
  div.classList.add('shake');
  setTimeout(() => div.classList.remove('shake'), 300);
}

// 🗓️ Build month-by-month calendar
function renderCalendar() {
  calContainer.innerHTML = '';
  if (!currentUser) return;

  let globalIdx = -1; // ensures Aug 1 = idx 0 = A shift

  monthRanges.forEach(m => {
    const mb = document.createElement('div');
    mb.className = 'month-block';
    mb.innerHTML = `<div class="month-title">${m.name}</div>`;
    const grid = document.createElement('div');
    grid.className = 'month-grid';
    mb.appendChild(grid);

    let d = new Date(m.start);
    const end = new Date(m.end);

    while (d <= end) {
      globalIdx++;
      const iso = d.toISOString().split('T')[0];
      const shift = getShiftForDay(globalIdx);
      const div = document.createElement('div');
      div.className = 'day';
      div.dataset.date = iso;
      div.dataset.shift = shift;
      div.dataset.globalIndex = globalIdx;
      div.textContent = `${d.getDate()}\n${shift}`;

      let blocked = true;
      if (mode === 'vacation') {
        blocked = shift !== currentUser.shift || blockedVacationDates.includes(iso);
      } else {
        const ns = getShiftForDay(globalIdx + 1);
        blocked = (shift + ns) !== {A:'BC',B:'CA',C:'AB'}[currentUser.shift];
      }

      if (!blocked) {
        div.addEventListener('click', () => 
          handlePick(div, globalIdx)
        );
      } else {
        div.classList.add('blocked');
      }

      if (vacationPicks.includes(iso)) div.classList.add('selected-vacation','selected');
      if (motPicks.includes(iso)) div.classList.add('selected-mot','selected');

      grid.appendChild(div);
      d.setDate(d.getDate() + 1);
    }

    calContainer.appendChild(mb);
  });

  updateModeUI();
}

// 🌟 Welcome text
function updateWelcome() {
  if (!currentUser) return;
  const vacLeft = vacationLimit - vacationPicks.length;
  const motLeft = motLimit - (motPicks.length / 2);
  welcomeMsg.textContent =
    `Welcome, ${currentUser.name} (Shift ${currentUser.shift}). ` +
    `You have ${vacLeft} vacation days and ${motLeft} MOT tour(s) remaining.`;
}

// 🧩 Listeners
selUser.addEventListener('change', () => {
  currentUser = firefighters.find(f => f.name === selUser.value) || null;
  vacationPicks = [];
  motPicks = [];
  clearModeVisuals();
  renderCalendar();
  if (currentUser) checkSeniorityTurn();
});

modeBtnVac.addEventListener('click', () => {
  mode = 'vacation';
  clearModeVisuals();
  renderCalendar();
});

modeBtnMOT.addEventListener('click', () => {
  mode = 'mot';
  clearModeVisuals();
  renderCalendar();
});

submitBtn.addEventListener('click', async () => {
  const payload = {
    name: currentUser.name,
    email: currentUser.email,
    shift: currentUser.shift,
    seniority: currentUser.seniority,
    vacationPicks,
    motPicks
  };
  submitBtn.disabled = true;
  await fetch(submitURL, {
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  checkSeniorityTurn();
});

// 🚀 Initialization
window.addEventListener('DOMContentLoaded', loadRoster);
