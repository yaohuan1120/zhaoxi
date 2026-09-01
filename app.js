const key = 'zhaoxi-planner-v1';
const now = new Date();
const todayKey = toDateKey(now);
let activeDate = new Date(now.getFullYear(), now.getMonth(), 1);
let data = loadData();
let journalDateKey = todayKey;
let journalWasTravelled = false;
let draggingTaskId = null;
const themeKeys = ['blue', 'mint', 'lavender', 'yellow', 'pink', 'orange', 'cyan', 'dark'];
const fontKeys = ['sans', 'rounded', 'serif', 'kaiti'];
const fontScaleMin = 90;
const fontScaleMax = 110;
const defaultBackgroundPaths = ['assets/backgrounds/background-1.jpg', 'assets/backgrounds/background-2.jpg', 'assets/backgrounds/background-3.jpg', 'assets/backgrounds/background-4.jpg'];

function selectedTheme() { return themeKeys.includes(data.theme) ? data.theme : 'blue'; }
function applyTheme(theme = selectedTheme()) {
  const resolvedTheme = themeKeys.includes(theme) ? theme : 'blue';
  document.documentElement.dataset.theme = resolvedTheme;
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    const active = button.dataset.themeChoice === resolvedTheme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function selectedFont() { return fontKeys.includes(data.font) ? data.font : 'sans'; }
function applyFont(font = selectedFont()) {
  const resolvedFont = fontKeys.includes(font) ? font : 'sans';
  document.documentElement.dataset.font = resolvedFont;
  document.querySelectorAll('[data-font-choice]').forEach(button => {
    const active = button.dataset.fontChoice === resolvedFont;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function selectedFontScale() {
  const value = Number(data.fontScale);
  return Number.isFinite(value) ? Math.min(fontScaleMax, Math.max(fontScaleMin, value)) : 100;
}
function applyFontScale(value = selectedFontScale()) {
  const resolved = Math.min(fontScaleMax, Math.max(fontScaleMin, Number(value) || 100));
  const scale = (resolved / 100) * 0.94;
  document.documentElement.style.setProperty('--layout-scale', String(resolved / 100));
  [11, 12, 13, 14, 15, 19, 26].forEach(size => document.documentElement.style.setProperty(`--font-${size}`, `${(size * scale).toFixed(2)}px`));
  const input = document.querySelector('#fontSizeRange');
  const output = document.querySelector('#fontSizeValue');
  if (input) input.value = String(resolved);
  if (output) output.textContent = `${resolved}%`;
}

function workspaceBackground() {
  const value = data.workspaceBackground;
  return typeof value === 'string' && (value.startsWith('data:image/') || defaultBackgroundPaths.includes(value)) ? value : '';
}
function applyWorkspaceBackground() {
  const mainContent = document.querySelector('.main-content');
  const background = workspaceBackground();
  const usingDefault = defaultBackgroundPaths.includes(background);
  mainContent.classList.toggle('has-custom-background', Boolean(background));
  mainContent.style.setProperty('--workspace-background', background ? `url("${background}")` : 'none');
  const status = document.querySelector('#workspaceBackgroundStatus');
  const clearButton = document.querySelector('#clearWorkspaceBackground');
  if (status) status.textContent = background ? (usingDefault ? '已启用默认背景（已加固定柔光蒙层）。' : '已启用本地背景（已加固定柔光蒙层）。') : '未设置背景；图片只会显示在右侧工作区。';
  if (clearButton) clearButton.hidden = !background;
  document.querySelectorAll('[data-default-background]').forEach(button => button.classList.toggle('active', button.dataset.defaultBackground === background));
}
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片无法打开。'));
      image.onload = () => resolve(image);
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
let pendingWorkspaceImage = null;
let workspaceCrop = {zoom: 1, offsetX: 0, offsetY: 0};
let workspaceCropDrag = null;
function cropViewportMetrics() {
  const viewport = document.querySelector('#workspaceCropViewport');
  if (!pendingWorkspaceImage || !viewport) return null;
  const width = viewport.clientWidth, height = viewport.clientHeight;
  if (!width || !height) return null;
  const baseScale = Math.max(width / pendingWorkspaceImage.naturalWidth, height / pendingWorkspaceImage.naturalHeight);
  const scale = baseScale * workspaceCrop.zoom;
  return {width, height, scale, imageWidth: pendingWorkspaceImage.naturalWidth * scale, imageHeight: pendingWorkspaceImage.naturalHeight * scale};
}
function clampWorkspaceCrop() {
  const metrics = cropViewportMetrics();
  if (!metrics) return;
  workspaceCrop.offsetX = Math.min(0, Math.max(metrics.width - metrics.imageWidth, workspaceCrop.offsetX));
  workspaceCrop.offsetY = Math.min(0, Math.max(metrics.height - metrics.imageHeight, workspaceCrop.offsetY));
}
function updateWorkspaceCropPreview({recenter = false} = {}) {
  const metrics = cropViewportMetrics();
  if (!metrics) return;
  if (recenter) {
    workspaceCrop.offsetX = (metrics.width - metrics.imageWidth) / 2;
    workspaceCrop.offsetY = (metrics.height - metrics.imageHeight) / 2;
  }
  clampWorkspaceCrop();
  const image = document.querySelector('#workspaceCropImage');
  image.style.width = `${metrics.imageWidth}px`;
  image.style.height = `${metrics.imageHeight}px`;
  image.style.transform = `translate(${workspaceCrop.offsetX}px,${workspaceCrop.offsetY}px)`;
}
function openWorkspaceCropper() {
  const cropLayer = document.querySelector('#workspaceCropModal');
  document.querySelector('#workspaceCropImage').src = pendingWorkspaceImage.src;
  document.querySelector('#workspaceCropZoom').value = '1';
  document.querySelector('#workspaceCropZoomValue').textContent = '100%';
  workspaceCrop = {zoom: 1, offsetX: 0, offsetY: 0};
  openLayer(cropLayer);
  requestAnimationFrame(() => updateWorkspaceCropPreview({recenter: true}));
}
function closeWorkspaceCropper() {
  pendingWorkspaceImage = null;
  workspaceCropDrag = null;
  document.querySelector('#workspaceCropImage').removeAttribute('src');
  closeLayer(document.querySelector('#workspaceCropModal'));
}
function exportWorkspaceCrop() {
  const metrics = cropViewportMetrics();
  const outputWidth = 1440, outputHeight = Math.round(outputWidth * metrics.height / metrics.width);
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const sourceX = -workspaceCrop.offsetX / metrics.scale;
  const sourceY = -workspaceCrop.offsetY / metrics.scale;
  const sourceWidth = metrics.width / metrics.scale;
  const sourceHeight = metrics.height / metrics.scale;
  canvas.getContext('2d').drawImage(pendingWorkspaceImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
  return canvas.toDataURL('image/jpeg', .8);
}

function toDateKey(date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); }
function dateFromKey(value) { return new Date(`${value}T00:00:00`); }
function loadData() {
  const saved = localStorage.getItem(key);
  if (saved) {
    const parsed = JSON.parse(saved);
    parsed.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    parsed.deadlines = Array.isArray(parsed.deadlines) ? parsed.deadlines : [];
    parsed.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
    const cleanedTasks = parsed.tasks.filter(task => !(task.title === '试验' && task.date === '2026-08-31' && task.startTime === '09:23' && task.endTime === '23:18'));
    let dataMigrated = cleanedTasks.length !== parsed.tasks.length;
    cleanedTasks.forEach(task => { if (!task.bucket) { task.bucket = task.date ? 'recent' : 'longterm'; dataMigrated = true; } });
    ['recent','longterm'].forEach(bucket=>cleanedTasks.filter(task => !task.date && task.bucket === bucket).forEach((task, index) => {
      if (!Number.isFinite(task.manualOrder)) { task.manualOrder = index; dataMigrated = true; }
    }));
    if (dataMigrated) {
      parsed.tasks = cleanedTasks;
      localStorage.setItem(key, JSON.stringify(parsed));
    }
    return parsed;
  }
  const dateAtOffset = offset => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return toDateKey(date);
  };
  return { tasks: [
    {id: crypto.randomUUID(), title: '最近待办1', date: dateAtOffset(0), startTime: '09:00', endTime: '10:00', done: false, notes: '', bucket: 'recent'},
    {id: crypto.randomUUID(), title: '最近待办2', date: dateAtOffset(1), startTime: '', endTime: '', done: false, notes: '', bucket: 'recent'},
    {id: crypto.randomUUID(), title: '最近待办3', date: dateAtOffset(2), startTime: '14:00', endTime: '15:30', done: false, notes: '', bucket: 'recent'},
    {id: crypto.randomUUID(), title: '最近待办4', date: '', startTime: '', endTime: '', done: false, notes: '', manualOrder: 0, bucket: 'recent'},
    {id: crypto.randomUUID(), title: '长期待办1', date: '', startTime: '', endTime: '', done: false, notes: '', manualOrder: 0, bucket: 'longterm'},
    {id: crypto.randomUUID(), title: '长期待办2', date: '', startTime: '', endTime: '', done: false, notes: '', manualOrder: 1, bucket: 'longterm'}
  ], deadlines: [
    {id: crypto.randomUUID(), title: '重要时间段1', start: `${dateAtOffset(0)}T09:00`, end: `${dateAtOffset(6)}T16:00`, notes: ''},
    {id: crypto.randomUUID(), title: '重要时间段2', start: `${dateAtOffset(1)}T13:00`, end: `${dateAtOffset(7)}T10:00`, notes: ''},
    {id: crypto.randomUUID(), title: '重要时间段3', start: `${dateAtOffset(2)}T08:00`, end: `${dateAtOffset(5)}T18:00`, notes: ''},
    {id: crypto.randomUUID(), title: '重要时间段4', start: `${dateAtOffset(3)}T14:00`, end: `${dateAtOffset(9)}T12:00`, notes: ''},
    {id: crypto.randomUUID(), title: '重要时间段5', start: `${dateAtOffset(4)}T10:00`, end: `${dateAtOffset(8)}T15:00`, notes: ''}
  ], logs: [] };
}
function persist() { localStorage.setItem(key, JSON.stringify(data)); }
function save() { persist(); render(); }
function formatCN(date) { return new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(date); }
function formatShort(dateString) { return new Intl.DateTimeFormat('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(dateString)); }
function formatJournalDate(key) { return new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(dateFromKey(key)); }
function escapeHTML(str) { return str.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function taskTitleHTML(title) {
  const chars = Array.from(String(title));
  const isHan = char => /[\u3400-\u9fff]/.test(char);
  const isLatinOrNumber = char => /[A-Za-z0-9]/.test(char);
  return chars.map((char, index) => {
    const previous = chars[index - 1];
    const boundary = previous && ((isHan(previous) && isLatinOrNumber(char)) || (isLatinOrNumber(previous) && isHan(char)));
    return `${boundary ? '<span class="title-boundary" aria-hidden="true"></span>' : ''}${escapeHTML(char)}`;
  }).join('');
}
function deadlineToneClass(lane) { return `deadline-tone-${Math.max(0, Number(lane) || 0) % 7}`; }
function getTodayTasks() { return data.tasks.filter(t => t.date === todayKey); }
function taskBucket(task) { return task.bucket === 'longterm' ? 'longterm' : 'recent'; }
function sortTasks(tasks) { return [...tasks].sort((a,b) => { const hasDate=task=>Boolean(task.date);if(hasDate(a)!==hasDate(b))return hasDate(a)?-1:1;if(a.date&&b.date){const dateDiff=a.date.localeCompare(b.date);if(dateDiff)return dateDiff;const timeDiff=(a.startTime||'23:59').localeCompare(b.startTime||'23:59');if(timeDiff)return timeDiff;}return (a.manualOrder ?? 0)-(b.manualOrder ?? 0); }); }
function nextManualOrder(bucket='recent') { return data.tasks.filter(task=>!task.date&&taskBucket(task)===bucket).reduce((max,task)=>Math.max(max,Number.isFinite(task.manualOrder)?task.manualOrder:-1),-1)+1; }
function taskHTML(task) { const draggable=!task.date; const meta=(task.notes||'') ? `<span class="task-meta"><span>${escapeHTML(task.notes)}</span></span>` : ''; const schedule=task.date||task.startTime ? `<span class="task-schedule-time ${task.startTime?'':'date-only'}"><span class="task-date-inline">${task.date ? task.date.slice(5).replace('-','/') : ''}</span><span class="task-time-inline">${task.startTime ? `${task.startTime}${task.endTime ? ` – ${task.endTime}` : ''}` : ''}</span></span>` : ''; return `<div class="task-item ${task.done ? 'done' : ''}" data-task-id="${task.id}" data-task-bucket="${taskBucket(task)}" draggable="${draggable}"><input class="check" type="checkbox" data-id="${task.id}" ${task.done ? 'checked' : ''}/><div class="task-main"><span class="task-title">${taskTitleHTML(task.title)}</span>${meta}</div>${schedule}<button class="delete-item" data-delete="${task.id}" aria-label="删除事项">×</button></div>`; }
function countdown(end) { const diff = new Date(end) - new Date(); if(diff <= 0) return '已结束'; const d=Math.floor(diff/864e5),h=Math.floor(diff%864e5/36e5),m=Math.floor(diff%36e5/6e4); return d ? `⌛️ ${d} 天 ${h} 小时` : `⌛️ ${h} 小时 ${m} 分钟`; }
function renderDashboard() {
  const recent = sortTasks(data.tasks.filter(t=>taskBucket(t)==='recent')); const done = recent.filter(t=>t.done).length;
  document.querySelector('#todayTasks').innerHTML = recent.length ? recent.map(taskHTML).join('') : '<p class="empty-copy">暂时没有最近待办。</p>';
  document.querySelector('#todayCount').textContent = `${recent.length} 项`;
  document.querySelector('#progressFill').style.width = recent.length ? `${done/recent.length*100}%` : '0%';
  document.querySelector('#progressCopy').textContent = recent.length ? `已完成 ${done} / ${recent.length} 项，慢慢来。` : '把最近想做的事写下来吧。';
  const long = sortTasks(data.tasks.filter(t=>taskBucket(t)==='longterm')); document.querySelector('#longtermTasks').innerHTML = long.length ? long.map(taskHTML).join('') : '<p class="empty-copy">这里放长期想做的事，可拖拽排序。</p>';
  document.querySelector('#longtermCount').textContent = `${long.length} 项`;
  const activeDeadlines=data.deadlines.filter(d=>new Date(d.end)>new Date()); document.querySelector('#deadlineList').innerHTML = activeDeadlines.length ? activeDeadlines.sort((a,b)=>new Date(a.end)-new Date(b.end)).map(d=>`<article class="deadline-card deadline-item" data-deadline-id="${d.id}" title="单击编辑时间段"><div class="deadline-row"><span class="countdown">${countdown(d.end)}</span><strong>${escapeHTML(d.title)}</strong><span class="deadline-meta"><small>${d.start.slice(5,16).replace('T',' ').replace('-','/')} – ${d.end.slice(5,16).replace('T',' ').replace('-','/')}</small><button class="delete-item" type="button" data-delete-deadline="${d.id}" aria-label="删除时间段" title="删除时间段">×</button></span></div></article>`).join('') : '<p class="empty-copy">暂时没有进行中的重要时间段。</p>';
  requestAnimationFrame(syncDashboardTimeAlignment);
}
function syncDashboardTimeAlignment(){document.querySelectorAll('#todayTasks .task-schedule-time').forEach(element=>element.style.transform='');}
function isDeadlineOnDate(d, day) { return day >= d.start.slice(0,10) && day <= d.end.slice(0,10); }
function renderCalendar() {
  const y=activeDate.getFullYear(), m=activeDate.getMonth(); document.querySelector('#calendarTitle').textContent=`${y}年${m+1}月`;
  const first=new Date(y,m,1), startOffset=(first.getDay()+6)%7, start=new Date(y,m,1-startOffset), end=new Date(start), grid=[];
  end.setDate(start.getDate()+41);
  const rangeStart=toDateKey(start), rangeEnd=toDateKey(end), laneEnds=[], deadlineLanes=new Map();
  data.deadlines.filter(d=>d.end.slice(0,10)>=rangeStart&&d.start.slice(0,10)<=rangeEnd).sort((a,b)=>a.start.localeCompare(b.start)).forEach(deadline=>{
    const startKey=deadline.start.slice(0,10), endKey=deadline.end.slice(0,10); let lane=0;
    while(laneEnds[lane]&&laneEnds[lane]>=startKey)lane++;
    laneEnds[lane]=endKey; deadlineLanes.set(deadline.id,lane);
  });
  for(let i=0;i<42;i++){
    const current=new Date(start);current.setDate(start.getDate()+i);const dKey=toDateKey(current), inMonth=current.getMonth()===m, weekday=i%7;
    const tasks=sortTasks(data.tasks.filter(t=>t.date===dKey)); const deadlines=data.deadlines.filter(d=>isDeadlineOnDate(d,dKey));
    const deadlineSlots=deadlines.length?Math.max(...deadlines.map(d=>deadlineLanes.get(d.id)+1)):0;
    const deadlineSegments=deadlines.map(d=>{const startKey=d.start.slice(0,10),endKey=d.end.slice(0,10),lane=deadlineLanes.get(d.id),startHour=Number(d.start.slice(11,13)),endHour=Number(d.end.slice(11,13)),startTime=d.start.slice(11,16),endTime=d.end.slice(11,16);const segmentStart=dKey===startKey||weekday===0;if(!segmentStart)return '';const daysUntilEnd=Math.max(0,Math.round((dateFromKey(endKey)-dateFromKey(dKey))/864e5)),segmentDays=Math.min(daysUntilEnd,6-weekday)+1,segmentEnd=daysUntilEnd<=6-weekday,startHalf=dKey===startKey&&startHour>12,endHalf=segmentEnd&&dKey===endKey&&endHour<=12,segmentWidth=(segmentDays-(startHalf?.5:0)-(endHalf?.5:0))*100,label=`${dKey===startKey?`${startTime} `:''}${escapeHTML(d.title)}`;return `<div class="calendar-deadline ${deadlineToneClass(lane)} deadline-segment-start ${segmentEnd?'deadline-segment-end':''} ${startHalf?'deadline-start-half':''} ${endHalf?'deadline-end-half':''}" data-deadline-id="${d.id}" style="--deadline-lane:${lane};--deadline-width:${segmentWidth}%" title="单击编辑时间段"><span class="deadline-label">${label}</span>${dKey===endKey?`<span class="deadline-end-time">${endTime}</span>`:''}</div>`;}).join('');
    const taskItems=`${tasks.filter(t=>!t.startTime).slice(0,2).map(t=>`<div class="calendar-task calendar-item ${t.done?'done':''}" data-task-id="${t.id}"><input class="calendar-check" type="checkbox" data-id="${t.id}" ${t.done?'checked':''}/><span>${escapeHTML(t.title)}</span></div>`).join('')}${tasks.filter(t=>t.startTime).slice(0,2).map(t=>`<div class="calendar-event calendar-item ${t.done?'done':''}" data-task-id="${t.id}"><input class="calendar-check" type="checkbox" data-id="${t.id}" ${t.done?'checked':''}/><span>${t.startTime} ${escapeHTML(t.title)}</span></div>`).join('')}`;
    const deadlineRowHeight=window.innerWidth<=610?19:24;
    grid.push(`<div class="calendar-day ${inMonth?'':'outside'} ${dKey===todayKey?'today':''}" data-date="${dKey}" style="--deadline-slots:${deadlineSlots};--calendar-extra-height:${Math.max(0,deadlineSlots-1)*deadlineRowHeight}px" title="点击空白处添加事项"><div class="day-number"><b>${current.getDate()}</b>${dKey===todayKey?'<em>今</em>':''}</div>${deadlineSegments}<div class="calendar-items">${taskItems}</div></div>`);
  }
  document.querySelector('#calendarGrid').innerHTML=grid.join('');
}
function renderJournal() {
  const entry = data.logs.find(log => log.date === journalDateKey);
  const hasContent = Boolean(entry && (entry.title.trim() || entry.content.trim()));
  document.querySelector('#journalDateLabel').textContent = formatJournalDate(journalDateKey);
  document.querySelector('#journalCardDate').textContent = journalDateKey.replaceAll('-', '.');
  document.querySelector('#journalWeekday').textContent = journalDateKey === todayKey
    ? '今日手记'
    : (journalDateKey > todayKey ? '未来手记' : '往日手记');
  document.querySelector('#journalDatePicker').value = journalDateKey;
  document.querySelector('#journalTitleInput').value = entry?.title || '';
  document.querySelector('#journalBodyInput').value = entry?.content || '';
  document.querySelector('#journalSaveStatus').textContent = journalWasTravelled ? '从记忆里抽出了这一页' : (hasContent ? '已悄悄保存到本机' : '写下的内容会保存在本机');
  const stage = document.querySelector('#journalStage');
  stage.classList.toggle('has-content', hasContent);
  stage.classList.toggle('time-travelled', journalWasTravelled);
  bindJournal();
}
function render() { document.querySelector('#todayLabel').textContent=formatCN(new Date()); renderDashboard();renderCalendar();renderJournal();bindDynamic(); }
function bindDynamic(){ document.querySelectorAll('.check,.calendar-check').forEach(e=>e.onchange=()=>{const t=data.tasks.find(t=>t.id===e.dataset.id);t.done=e.checked;save();});document.querySelectorAll('[data-delete]').forEach(e=>e.onclick=()=>{data.tasks=data.tasks.filter(t=>t.id!==e.dataset.delete);save();});document.querySelectorAll('[data-delete-deadline]').forEach(e=>e.onclick=()=>{data.deadlines=data.deadlines.filter(d=>d.id!==e.dataset.deleteDeadline);save();});document.querySelectorAll('.task-item,.schedule-item').forEach(e=>e.onclick=event=>{if(event.target.closest('.check,.delete-item'))return;const task=data.tasks.find(t=>t.id===e.dataset.taskId);if(task)openModal('task','',task);});document.querySelectorAll('.deadline-item').forEach(e=>e.onclick=event=>{if(event.target.closest('.delete-item'))return;const deadline=data.deadlines.find(d=>d.id===e.dataset.deadlineId);if(deadline)openModal('deadline','',deadline);});document.querySelectorAll('.calendar-item').forEach(e=>e.onclick=event=>{if(event.target.closest('.calendar-check'))return;openModal('task','',data.tasks.find(t=>t.id===e.dataset.taskId));});document.querySelectorAll('.calendar-deadline').forEach(e=>e.onclick=()=>{const deadline=data.deadlines.find(d=>d.id===e.dataset.deadlineId);if(deadline)openModal('deadline','',deadline);});document.querySelectorAll('.calendar-day').forEach(day=>day.onclick=event=>{if(event.target.closest('.calendar-item')||event.target.closest('.calendar-deadline'))return;openModal('task',day.dataset.date);});bindTaskDragAndDrop(); }
function bindTaskDragAndDrop(){document.querySelectorAll('.task-item[draggable="true"]').forEach(item=>{item.ondragstart=event=>{draggingTaskId=item.dataset.taskId;item.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggingTaskId);};item.ondragover=event=>{if(!draggingTaskId||draggingTaskId===item.dataset.taskId)return;event.preventDefault();event.dataTransfer.dropEffect='move';item.classList.add('drag-over');};item.ondragleave=()=>item.classList.remove('drag-over');item.ondrop=event=>{event.preventDefault();const sourceId=event.dataTransfer.getData('text/plain')||draggingTaskId,targetId=item.dataset.taskId,bucket=item.dataset.taskBucket;if(!sourceId||sourceId===targetId)return;const unordered=sortTasks(data.tasks.filter(task=>!task.date&&taskBucket(task)===bucket));const sourceIndex=unordered.findIndex(task=>task.id===sourceId),targetIndex=unordered.findIndex(task=>task.id===targetId);if(sourceIndex<0||targetIndex<0)return;const [moved]=unordered.splice(sourceIndex,1);unordered.splice(targetIndex,0,moved);unordered.forEach((task,index)=>task.manualOrder=index);persist();render();};item.ondragend=()=>{draggingTaskId=null;document.querySelectorAll('.task-item').forEach(row=>row.classList.remove('dragging','drag-over'));};});}
function changeJournalDay(offset) { const next = dateFromKey(journalDateKey); next.setDate(next.getDate() + offset); journalDateKey = toDateKey(next); journalWasTravelled = false; renderJournal(); }
function writeJournal() {
  const title = document.querySelector('#journalTitleInput').value.trim();
  const content = document.querySelector('#journalBodyInput').value.trim();
  const existing = data.logs.find(log => log.date === journalDateKey);
  if (title || content) {
    if (existing) Object.assign(existing, {title, content, updatedAt: new Date().toISOString()});
    else data.logs.push({id: crypto.randomUUID(), date: journalDateKey, title, content, updatedAt: new Date().toISOString()});
  } else if (existing) data.logs = data.logs.filter(log => log.date !== journalDateKey);
  persist();
  document.querySelector('#journalStage').classList.toggle('has-content', Boolean(title || content));
  document.querySelector('#journalSaveStatus').textContent = title || content ? '已悄悄保存到本机' : '写下的内容会保存在本机';
}
function bindJournal() {
  document.querySelector('#previousJournalDay').onclick = () => changeJournalDay(-1);
  document.querySelector('#nextJournalDay').onclick = () => changeJournalDay(1);
  document.querySelector('#journalDatePicker').onchange = event => { if (event.target.value) { journalDateKey = event.target.value; journalWasTravelled = false; renderJournal(); } };
  document.querySelector('#journalTitleInput').oninput = writeJournal;
  document.querySelector('#journalBodyInput').oninput = writeJournal;
}
const modal=document.querySelector('#taskModal'), form=document.querySelector('#taskForm');let editingTaskId=null;let editingDeadlineId=null;let editingTaskBucket='recent';
function populateTimeOptions(){document.querySelectorAll('.time-select').forEach(select=>{select.innerHTML='<option value="">选择时间</option>';for(let hour=0;hour<24;hour++){for(const minute of [0,30]){const time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;select.insertAdjacentHTML('beforeend',`<option value="${time}">${time}</option>`);}}});}
function openLayer(layer){layer.hidden=false;}
function closeLayer(layer){layer.hidden=true;}
function openModal(kind='task', quick='', item=null, bucket='recent') { form.reset();editingTaskId=null;editingDeadlineId=null;editingTaskBucket=kind==='task'?(item?taskBucket(item):bucket):bucket;form.itemType.value=kind;const editing=Boolean(item);document.querySelector('#taskModalTitle').textContent=editing?(kind==='deadline'?'编辑时间段':'编辑事项'):(kind==='deadline'?'添加时间段':'添加一个事项');form.querySelector('button[type="submit"]').textContent=editing?'保存修改':(kind==='deadline'?'保存时间段':'保存事项');document.querySelectorAll('.choice-card').forEach(x=>x.classList.toggle('active',x.querySelector('input').value===kind));if(item&&kind==='deadline'){editingDeadlineId=item.id;form.title.value=item.title;[form.deadlineStartDate.value,form.deadlineStartTime.value]=item.start.split('T');[form.deadlineEndDate.value,form.deadlineEndTime.value]=item.end.split('T');form.notes.value=item.notes||'';}else if(item){editingTaskId=item.id;form.title.value=item.title;form.date.value=item.date;form.startTime.value=item.startTime;form.endTime.value=item.endTime;form.notes.value=item.notes||'';}syncModalFields();if(quick==='today')form.date.value=todayKey;else if(quick)form.date.value=quick;openLayer(modal);form.title.focus();}
function syncModalFields(){const isDeadline=form.itemType.value==='deadline';document.querySelector('#timeFields').classList.toggle('hidden',isDeadline);document.querySelector('#deadlineFields').classList.toggle('hidden',!isDeadline);}
document.querySelector('#openDeadlineModal').onclick=()=>openModal('deadline');document.querySelectorAll('.add-inline').forEach(e=>e.onclick=()=>openModal('task',e.dataset.quickDate,'',e.dataset.taskBucket||'recent'));form.itemType.forEach(e=>e.onchange=()=>{document.querySelectorAll('.choice-card').forEach(x=>x.classList.toggle('active',x.querySelector('input').checked));syncModalFields();});
function clearTimeValidation(){document.querySelector('#timeValidation').hidden=true;document.querySelectorAll('.time-invalid').forEach(field=>field.classList.remove('time-invalid'));}
function showTimeValidation(message, fieldNames){const notice=document.querySelector('#timeValidation');notice.textContent=message;notice.hidden=false;fieldNames.forEach(name=>form.elements[name]?.classList.add('time-invalid'));}
form.addEventListener('submit',e=>{e.preventDefault();clearTimeValidation();const f=new FormData(form);if(f.get('itemType')==='deadline'){if(!f.get('deadlineStartDate')||!f.get('deadlineStartTime')||!f.get('deadlineEndDate')||!f.get('deadlineEndTime')){showTimeValidation('请填写开始和结束日期与时间。',['deadlineStartDate','deadlineStartTime','deadlineEndDate','deadlineEndTime']);return;}const start=`${f.get('deadlineStartDate')}T${f.get('deadlineStartTime')}`,end=`${f.get('deadlineEndDate')}T${f.get('deadlineEndTime')}`;if(new Date(end)<=new Date(start)){showTimeValidation('结束日期和时间必须晚于开始日期和时间。',['deadlineStartDate','deadlineStartTime','deadlineEndDate','deadlineEndTime']);return;}const payload={title:f.get('title').trim(),start,end,notes:f.get('notes').trim()};const editingDeadline=editingDeadlineId&&data.deadlines.find(d=>d.id===editingDeadlineId);if(editingDeadline)Object.assign(editingDeadline,payload);else data.deadlines.push({id:crypto.randomUUID(),...payload});}else{const startTime=f.get('startTime'),endTime=f.get('endTime');if(startTime&&endTime&&endTime<=startTime){showTimeValidation('结束时间必须晚于开始时间。',['startTime','endTime']);return;}const payload={title:f.get('title').trim(),date:f.get('date'),startTime,endTime,notes:f.get('notes').trim()};const editingTask=editingTaskId&&data.tasks.find(t=>t.id===editingTaskId);if(editingTask){if(!payload.date&&!Number.isFinite(editingTask.manualOrder))payload.manualOrder=nextManualOrder(editingTaskBucket);Object.assign(editingTask,payload,{bucket:editingTaskBucket});}else data.tasks.push({id:crypto.randomUUID(),...payload,done:false,bucket:editingTaskBucket,manualOrder:payload.date?undefined:nextManualOrder(editingTaskBucket)});}closeLayer(modal);save();});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelectorAll('.nav-item').forEach(v=>v.classList.remove('active'));document.querySelector(`#${b.dataset.view}View`).classList.add('active');document.querySelectorAll(`[data-view="${b.dataset.view}"]`).forEach(x=>x.classList.add('active'));document.body.classList.toggle('calendar-mode',b.dataset.view==='calendar');document.body.classList.toggle('journal-mode',b.dataset.view==='journal');setMobileNavigation(false);window.scrollTo({top:0,behavior:'smooth'});});
document.querySelector('#prevMonth').onclick=()=>{activeDate.setMonth(activeDate.getMonth()-1);renderCalendar();};document.querySelector('#nextMonth').onclick=()=>{activeDate.setMonth(activeDate.getMonth()+1);renderCalendar();};document.querySelector('#jumpToday').onclick=()=>{activeDate=new Date(now.getFullYear(),now.getMonth(),1);renderCalendar();};
document.querySelector('#timeTravelButton').onclick=()=>{const written=data.logs.filter(log=>log.title.trim()||log.content.trim());if(!written.length){journalDateKey=todayKey;journalWasTravelled=false;renderJournal();document.querySelector('#journalSaveStatus').textContent='还没有往日的日志，先从今天写起吧';return;}const choices=written.length>1?written.filter(log=>log.date!==journalDateKey):written;const picked=choices[Math.floor(Math.random()*choices.length)];journalDateKey=picked.date;journalWasTravelled=true;renderJournal();};
document.querySelector('#presentButton').onclick=()=>{journalDateKey=todayKey;journalWasTravelled=false;renderJournal();};
document.querySelector('#settingsButton').onclick=()=>{setMobileNavigation(false);openLayer(document.querySelector('#settingsModal'));};
document.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>{data.theme=button.dataset.themeChoice;persist();applyTheme(data.theme);});
document.querySelectorAll('[data-font-choice]').forEach(button=>button.onclick=()=>{data.font=button.dataset.fontChoice;persist();applyFont(data.font);});
document.querySelector('#fontSizeRange').oninput=event=>{data.fontScale=Number(event.target.value);persist();applyFontScale(data.fontScale);requestAnimationFrame(syncDashboardTimeAlignment);};
const workspaceBackgroundActions=document.querySelector('.workspace-background-row .background-actions');
if(workspaceBackgroundActions&&!document.querySelector('#openDefaultBackgroundPicker')){
  document.querySelector('.background-upload-button').firstChild.textContent='本地图片';
  workspaceBackgroundActions.insertAdjacentHTML('afterbegin','<button class="secondary-button" type="button" id="openDefaultBackgroundPicker">默认背景</button>');
  workspaceBackgroundActions.parentElement.insertAdjacentHTML('beforeend','<div class="default-background-picker" id="defaultBackgroundPicker" hidden><p>选择一张默认背景</p><div class="default-background-grid" role="group" aria-label="默认背景图">'+defaultBackgroundPaths.map((path,index)=>`<button type="button" class="default-background-option" data-default-background="${path}" aria-label="默认背景 ${index+1}"><img src="${path}" alt="默认背景 ${index+1}"></button>`).join('')+'</div></div>');
}
document.querySelector('#workspaceBackgroundInput').onchange=async event=>{
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file)return;
  if(!file.type.startsWith('image/')){window.alert('请选择图片文件。');return;}
  try{
    pendingWorkspaceImage=await readImageFile(file);
    openWorkspaceCropper();
  }catch(error){
    window.alert(error?.message||'背景图片设置失败。');
  }
};
document.querySelector('#openDefaultBackgroundPicker').onclick=()=>{
  const picker=document.querySelector('#defaultBackgroundPicker');
  picker.hidden=!picker.hidden;
};
document.querySelectorAll('[data-default-background]').forEach(button=>button.onclick=()=>{
  data.workspaceBackground=button.dataset.defaultBackground;
  persist();
  applyWorkspaceBackground();
  document.querySelector('#defaultBackgroundPicker').hidden=true;
});
document.querySelector('#clearWorkspaceBackground').onclick=()=>{delete data.workspaceBackground;persist();applyWorkspaceBackground();};
document.querySelectorAll('[data-close-crop]').forEach(button=>button.onclick=closeWorkspaceCropper);
document.querySelector('#workspaceCropZoom').oninput=event=>{
  const previousMetrics=cropViewportMetrics();
  const centerX=(previousMetrics.width/2-workspaceCrop.offsetX)/previousMetrics.scale;
  const centerY=(previousMetrics.height/2-workspaceCrop.offsetY)/previousMetrics.scale;
  workspaceCrop.zoom=Number(event.target.value);
  const nextMetrics=cropViewportMetrics();
  workspaceCrop.offsetX=nextMetrics.width/2-centerX*nextMetrics.scale;
  workspaceCrop.offsetY=nextMetrics.height/2-centerY*nextMetrics.scale;
  document.querySelector('#workspaceCropZoomValue').textContent=`${Math.round(workspaceCrop.zoom*100)}%`;
  updateWorkspaceCropPreview();
};
document.querySelector('#workspaceCropViewport').onpointerdown=event=>{
  if(!pendingWorkspaceImage)return;
  workspaceCropDrag={x:event.clientX,y:event.clientY,offsetX:workspaceCrop.offsetX,offsetY:workspaceCrop.offsetY};
  event.currentTarget.setPointerCapture(event.pointerId);
};
document.querySelector('#workspaceCropViewport').onpointermove=event=>{
  if(!workspaceCropDrag)return;
  workspaceCrop.offsetX=workspaceCropDrag.offsetX+event.clientX-workspaceCropDrag.x;
  workspaceCrop.offsetY=workspaceCropDrag.offsetY+event.clientY-workspaceCropDrag.y;
  updateWorkspaceCropPreview();
};
document.querySelector('#workspaceCropViewport').onpointerup=()=>{workspaceCropDrag=null;};
document.querySelector('#applyWorkspaceCrop').onclick=()=>{
  const previous=data.workspaceBackground;
  try{
    data.workspaceBackground=exportWorkspaceCrop();
    persist();
    applyWorkspaceBackground();
    closeWorkspaceCropper();
  }catch(error){
    data.workspaceBackground=previous;
    window.alert(error?.name==='QuotaExceededError'?'裁剪后的图片仍然过大，请换一张更小的图片。':(error?.message||'背景图片保存失败。'));
  }
};
function setMobileNavigation(open){document.body.classList.toggle('mobile-nav-open',open);document.querySelector('.mobile-menu').setAttribute('aria-expanded',String(open));}
document.querySelector('.mobile-menu').onclick=()=>setMobileNavigation(!document.body.classList.contains('mobile-nav-open'));
document.querySelector('.mobile-sidebar-close').onclick=()=>setMobileNavigation(false);
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>closeLayer(button.closest('.modal-layer'))));
document.querySelectorAll('.modal-layer').forEach(layer=>layer.addEventListener('pointerdown',event=>{if(event.target===layer){if(layer.id==='workspaceCropModal')closeWorkspaceCropper();else closeLayer(layer);}}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.modal-layer:not([hidden])').forEach(layer=>{if(layer.id==='workspaceCropModal')closeWorkspaceCropper();else closeLayer(layer);});});
populateTimeOptions();
applyTheme();
applyFont();
applyFontScale();
applyWorkspaceBackground();
render();
setInterval(()=>{renderDashboard();bindDynamic();},60000);
let alignmentFrame;
window.addEventListener('resize',()=>{cancelAnimationFrame(alignmentFrame);alignmentFrame=requestAnimationFrame(syncDashboardTimeAlignment);});
